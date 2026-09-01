import { compressReceiptImage } from './imageUtils';
import { ENVIRONMENTS, getStoredEnvironment } from '../config/environments';

export interface ParsedReceiptItem {
  name: string;
  price: number;
  quantity?: number;
  assignedTo?: string[];
  selected?: boolean;
}

export interface ParsedReceiptData {
  merchant: string;
  date?: string;
  total: number;
  currency: string;
  category?: string;
  items: ParsedReceiptItem[];
  summary?: string;
  tax?: number;
  tip?: number;
  discount?: number;
  subtotal?: number;
}

export interface ScanReceiptOptions {
  fileOrBase64: File | string;
  mimeType?: string;
  gasUrl?: string;
}

export interface ScanReceiptResult {
  success: boolean;
  receipt?: ParsedReceiptData;
  error?: string;
  isRateLimit?: boolean;
  isDisabled?: boolean;
  retryAfter?: number;
  source?: 'express' | 'apps_script';
}

/**
 * Check backend OCR status (enabled vs disabled vs rate limited)
 */
export async function checkOcrBackendStatus(): Promise<{
  enabled: boolean;
  isRateLimited: boolean;
  retryAfterSeconds: number;
  maintenanceMessage: string | null;
}> {
  try {
    const res = await fetch('/api/ocr-status');
    if (res.ok) {
      const data = await res.json();
      return {
        enabled: data.enabled !== false,
        isRateLimited: !!data.isRateLimited,
        retryAfterSeconds: data.retryAfterSeconds || 0,
        maintenanceMessage: data.maintenanceMessage || null
      };
    }
  } catch (e) {
    // If running in pure static or error, default to enabled
  }
  return {
    enabled: true,
    isRateLimited: false,
    retryAfterSeconds: 0,
    maintenanceMessage: null
  };
}

/**
 * Robust OCR receipt parser that works seamlessly across all hosting environments:
 * 1. AI Studio dev/preview container (Express /api/scan-receipt)
 * 2. Telegram Mini App on GitHub Pages / static hosting (routes to Google Apps Script backend)
 */
export async function scanReceiptWithAI(options: ScanReceiptOptions): Promise<ScanReceiptResult> {
  const { fileOrBase64, mimeType: explicitMime, gasUrl } = options;

  let base64 = '';
  let cleanMime = explicitMime || 'image/jpeg';

  // 1. Client-side compression to ~1280px / ~150KB for fast uploads and reliable mobile network transport
  if (typeof fileOrBase64 === 'string') {
    if (fileOrBase64.startsWith('data:')) {
      const match = fileOrBase64.match(/^data:([^;]+);base64,/);
      if (match) cleanMime = match[1];
      base64 = fileOrBase64;
    } else {
      base64 = fileOrBase64;
    }
  } else {
    try {
      const compressed = await compressReceiptImage(fileOrBase64, 1280, 0.85);
      base64 = compressed.base64;
      cleanMime = compressed.mimeType || fileOrBase64.type || 'image/jpeg';
    } catch (err) {
      console.warn('Compression fallback to FileReader:', err);
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(fileOrBase64);
      });
      cleanMime = fileOrBase64.type || 'image/jpeg';
    }
  }

  // Strip data URL header if present for clean payload
  const rawBase64Only = base64.includes('base64,') ? base64.split('base64,')[1] : base64;

  let lastErrorMsg = '';

  // -------------------------------------------------------------
  // STRATEGY 1: Try /api/scan-receipt endpoint
  // (Works on Vercel Serverless Function & AI Studio Express server)
  // -------------------------------------------------------------
  try {
    const apiRes = await fetch('/api/scan-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64,
        mimeType: cleanMime
      })
    });

    const contentType = apiRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await apiRes.json().catch(() => ({}));

      if (apiRes.ok && data.success && data.receipt) {
        return {
          success: true,
          receipt: normalizeReceiptData(data.receipt),
          source: 'express'
        };
      }

      if (apiRes.status === 429 || data.isRateLimit) {
        return {
          success: false,
          isRateLimit: true,
          retryAfter: data.retryAfter || 20,
          error: data.error || 'Gemini API rate limit reached. Please wait a moment before trying again.'
        };
      }

      if (apiRes.status === 503 || data.isDisabled) {
        return {
          success: false,
          isDisabled: true,
          error: data.error || 'Upload receipt feature is currently under works. Please enter items manually.'
        };
      }

      if (data.error) {
        lastErrorMsg = data.error;
      }
    }
  } catch (apiErr: any) {
    console.warn('/api/scan-receipt request not available (falling back to Google Apps Script):', apiErr);
  }

  // -------------------------------------------------------------
  // STRATEGY 2: Route through Google Apps Script backend
  // (Works in Telegram Mini App hosted statically on GitHub Pages/CDN)
  // -------------------------------------------------------------
  const activeEnv = getStoredEnvironment();
  const savedGas = typeof localStorage !== 'undefined' ? (localStorage.getItem('splitsquad_gas_url') || '') : '';
  const fallbackGasUrl = gasUrl || savedGas || ENVIRONMENTS[activeEnv]?.defaultGasUrl || ENVIRONMENTS.main.defaultGasUrl;

  if (fallbackGasUrl && fallbackGasUrl.startsWith('http')) {
    try {
      const gasRes = await fetch(fallbackGasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'scan_receipt',
          image: rawBase64Only,
          base64: rawBase64Only,
          mimeType: cleanMime
        })
      });

      const gasData = await gasRes.json().catch(() => null);

      if (gasData) {
        if ((gasData.status === 'success' || gasData.ok) && (gasData.receipt || gasData.data)) {
          const rawReceipt = gasData.receipt || gasData.data;
          return {
            success: true,
            receipt: normalizeReceiptData(rawReceipt),
            source: 'apps_script'
          };
        }

        if (gasData.message || gasData.error) {
          const msg = String(gasData.message || gasData.error);
          if (msg.includes('GEMINI_API_KEY')) {
            return {
              success: false,
              error: 'GEMINI_API_KEY is not configured in Google Apps Script properties. Please set GEMINI_API_KEY in your Apps Script Project Settings.'
            };
          }
          if (msg.includes('Unknown action: scan_receipt')) {
            return {
              success: false,
              error: 'Google Apps Script needs to be updated. Please copy the latest Code.gs into your Apps Script editor and click "Deploy > New deployment".'
            };
          }
          if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
            return {
              success: false,
              isRateLimit: true,
              retryAfter: 20,
              error: 'Gemini Vision API quota limit reached. Please wait ~20 seconds.'
            };
          }
          lastErrorMsg = msg;
        }
      }
    } catch (gasErr: any) {
      console.error('Google Apps Script OCR Error:', gasErr);
      lastErrorMsg = gasErr.message || 'Failed to connect to Google Apps Script OCR service';
    }
  }

  return {
    success: false,
    error: lastErrorMsg || 'OCR backend is unavailable. Please verify GEMINI_API_KEY is configured in Vercel Environment Variables or your Apps Script Script Properties.'
  };
}

function normalizeReceiptData(raw: any): ParsedReceiptData {
  const items: ParsedReceiptItem[] = Array.isArray(raw.items)
    ? raw.items.map((it: any) => ({
        name: String(it.name || 'Item').trim(),
        price: Math.abs(Number(it.price) || 0),
        quantity: Math.max(1, Number(it.quantity) || 1),
        selected: true
      }))
    : [];

  return {
    merchant: String(raw.merchant || 'Store / Merchant').trim(),
    date: raw.date || new Date().toISOString().split('T')[0],
    total: Math.abs(Number(raw.total) || items.reduce((sum, i) => sum + i.price * (i.quantity || 1), 0)),
    currency: raw.currency || '₱',
    category: raw.category || 'Food & Drink',
    items: items,
    summary: raw.summary || `Receipt from ${raw.merchant || 'merchant'}`,
    tax: Math.abs(Number(raw.tax) || 0),
    tip: Math.abs(Number(raw.tip) || 0),
    discount: Math.abs(Number(raw.discount) || 0),
    subtotal: Math.abs(Number(raw.subtotal) || 0)
  };
}
