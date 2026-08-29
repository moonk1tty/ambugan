import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;
function getAi(apiKey: string): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'splitnest-vercel',
        }
      }
    });
  }
  return aiClient;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { image, base64, mimeType } = req.body || {};
    const rawData = image || base64;
    if (!rawData) {
      return res.status(400).json({ error: 'Missing image data in request' });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
    if (!apiKey) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured in Vercel Environment Variables. Please add GEMINI_API_KEY in your Vercel Project Settings.'
      });
    }

    let cleanBase64 = String(rawData).trim();
    let cleanMime = mimeType || 'image/jpeg';

    if (cleanBase64.startsWith('data:')) {
      const matches = cleanBase64.match(/^data:([^;]+);base64,(.+)$/s);
      if (matches) {
        cleanMime = matches[1];
        cleanBase64 = matches[2];
      } else if (cleanBase64.includes('base64,')) {
        const parts = cleanBase64.split('base64,');
        cleanBase64 = parts[1];
      }
    }

    cleanBase64 = cleanBase64.replace(/[\r\n\s]/g, '');

    if (!cleanMime || cleanMime === 'application/octet-stream') {
      cleanMime = 'image/jpeg';
    }

    const ai = getAi(apiKey);
    const prompt = `You are an expert OCR receipt parser for Splitnest, specializing in international and Philippine receipts/invoices.
Carefully inspect this receipt image and accurately extract the data into structured JSON with these exact fields:
{
  "merchant": "Store or Restaurant name",
  "total": 123.45,
  "subtotal": 123.45,
  "currency": "₱",
  "date": "YYYY-MM-DD",
  "category": "Food & Drink",
  "tax": 0.00,
  "tip": 0.00,
  "discount": 0.00,
  "items": [
    { "name": "Dish or item name", "price": 12.50, "quantity": 1 }
  ],
  "summary": "Short 1-sentence summary"
}

IMPORTANT PHILIPPINES & VAT-INCLUSIVE RECEIPT RULES:
1. VAT IS ALREADY INCLUDED IN ITEM PRICES (DO NOT ADD EXTRA TAX):
   - In the Philippines and VAT-inclusive regions, standard 12% VAT is ALREADY incorporated into the menu prices and individual SKU line items.
   - Receipts often show a bottom statutory breakdown: "VATable Sales", "12% VAT", "VAT Amount", "VAT Exempt Sales", "Zero-Rated Sales".
   - DO NOT extract or add this listed VAT as an extra tax charge ("tax: 0.0"). The line items already sum to the subtotal including VAT. Adding it again would cause double-taxation.
   - Only set "tax" > 0 if tax was explicitly charged on top of exclusive subtotal prices (like US sales tax).

2. SERVICE CHARGE (SC):
   - In Philippine restaurants, "Service Charge" (often 5% to 10% of subtotal, or labeled "SC") is added on top of food items.
   - Extract the Service Charge amount as "tip" (service charge / tip field) so it is properly added to the bill total.

3. PWD / SENIOR CITIZEN DISCOUNTS & VAT EXEMPTION:
   - In the Philippines, PWD (Persons with Disability) and Senior Citizen discounts typically consist of TWO lines:
     a) "PWD/SC Discount" (e.g. 20% discount on food portion)
     b) "VAT Exemption" / "Less VAT" (the 12% VAT deduction)
   - Combine BOTH the PWD/Senior discount AND the VAT exemption deduction (plus any promo vouchers) into the "discount" field as total deduction.

4. ACCURACY & CONSISTENCY:
   - "items": Array of all dishes/SKUs with name, quantity, and line price (which includes VAT).
   - "subtotal": The sum of line items.
   - "total": The exact final payable amount on the receipt (Subtotal + Service Charge - Total Discounts).
   - "currency": Use ₱ for PHP, $ for USD, € for EUR, ¥ for JPY, etc. Default to ₱ if in the Philippines context.
   - Return ONLY raw JSON without markdown formatting.`;

    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-flash-latest'
    ];

    let parsed: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: cleanBase64
                  }
                },
                { text: prompt }
              ]
            }
          ],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });

        const rawText = response.text || '';
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(cleaned);
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!parsed) {
      throw lastError || new Error('All Gemini OCR models failed to parse receipt');
    }

    return res.status(200).json({
      success: true,
      receipt: parsed
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to scan receipt with Gemini AI'
    });
  }
}
