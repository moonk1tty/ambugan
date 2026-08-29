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
  retryAfter?: number;
  source?: 'express' | 'apps_script';
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
  // STRATEGY 1: Try local Express server route (/api/scan-receipt)
  // (Works when hosted with full-stack Node container in AI Studio)
  // -------------------------------------------------------------
  try {
    const expressRes = await fetch('/api/scan-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64,
        mimeType: cleanMime
      })
    });

    // If endpoint exists and responded
    if (expressRes.status !== 404 && expressRes.status !== 405) {
      const data = await expressRes.json().catch(() => ({}));

      if (expressRes.status === 429 || data.isRateLimit) {
        return {
          success: false,
          isRateLimit: true,
          retryAfter: data.retryAfter || 20,
          error: data.error || 'Gemini API rate limit reached. Please wait a moment before trying again.'
        };
      }

      if (expressRes.ok && data.success && data.receipt) {
        return {
          success: true,
          receipt: normalizeReceiptData(data.receipt),
          source: 'express'
        };
      }

      if (data.error) {
        lastErrorMsg = data.error;
      }
    }
  } catch (expressErr: any) {
    console.warn('Express /api/scan-receipt not available (running in static / Telegram Mini App context):', expressErr);
  }

  // -------------------------------------------------------------
  // STRATEGY 2: Route through Google Apps Script backend
  // (Works in Telegram Mini App hosted statically on GitHub Pages/CDN)
  // -------------------------------------------------------------
  const activeEnv = getStoredEnvironment();
  const fallbackGasUrl = gasUrl || ENVIRONMENTS[activeEnv]?.defaultGasUrl || ENVIRONMENTS.main.defaultGasUrl;

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
          const msg = gasData.message || gasData.error;
          if (msg.includes('GEMINI_API_KEY')) {
            return {
              success: false,
              error: 'Gemini API key is not configured in Google Apps Script properties. Please set GEMINI_API_KEY in your Apps Script Project Settings.'
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
    error: lastErrorMsg || 'OCR backend is unavailable. You can enter expense items manually or pick a sample receipt.'
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
