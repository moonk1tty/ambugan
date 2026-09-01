import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Track backend OCR state & rate limits
  let isBackendOcrDisabled = process.env.ENABLE_OCR === "false" || process.env.DISABLE_OCR === "true";
  let ocrRateLimitResetTime = 0;

  // OCR Status endpoint to proactively inform frontend if feature is disabled or rate limited
  app.get("/api/ocr-status", (req, res) => {
    const isRateLimited = Date.now() < ocrRateLimitResetTime;
    const retryAfter = isRateLimited ? Math.max(1, Math.ceil((ocrRateLimitResetTime - Date.now()) / 1000)) : 0;
    
    res.json({
      enabled: !isBackendOcrDisabled,
      isRateLimited: isRateLimited,
      retryAfterSeconds: retryAfter,
      maintenanceMessage: isBackendOcrDisabled 
        ? "AI Receipt Upload is temporarily under works. Please log items manually below." 
        : null
    });
  });

  // OCR Receipt Scan Endpoint with Gemini Vision
  app.post("/api/scan-receipt", async (req, res) => {
    try {
      if (isBackendOcrDisabled) {
        return res.status(503).json({
          success: false,
          isDisabled: true,
          error: "Upload receipt feature is currently under works. Please enter items manually."
        });
      }

      if (Date.now() < ocrRateLimitResetTime) {
        const remaining = Math.max(1, Math.ceil((ocrRateLimitResetTime - Date.now()) / 1000));
        return res.status(429).json({
          success: false,
          isRateLimit: true,
          retryAfter: remaining,
          error: `Gemini API Free Tier rate limit reached. Auto-ready in ${remaining}s, or enter dishes manually.`
        });
      }

      const { image, base64, mimeType } = req.body;
      const rawData = image || base64;
      if (!rawData) {
        return res.status(400).json({ error: "Missing image data in request" });
      }

      let cleanBase64 = String(rawData).trim();
      let cleanMime = mimeType || "image/jpeg";

      if (cleanBase64.startsWith("data:")) {
        const matches = cleanBase64.match(/^data:([^;]+);base64,(.+)$/s);
        if (matches) {
          cleanMime = matches[1];
          cleanBase64 = matches[2];
        } else if (cleanBase64.includes("base64,")) {
          const parts = cleanBase64.split("base64,");
          cleanBase64 = parts[1];
        }
      }

      // Remove any whitespace or newline characters from base64 string
      cleanBase64 = cleanBase64.replace(/[\r\n\s]/g, "");

      // Ensure valid standard MIME type for Gemini
      if (!cleanMime || cleanMime === "application/octet-stream") {
        cleanMime = "image/jpeg";
      }

      const ai = getAi();
      const prompt = `You are an expert OCR receipt parser for Splitnest, specializing in international and Philippine receipts/invoices.
Carefully inspect this receipt image and accurately extract the data into structured JSON.

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
   - "currency": Use ₱ for PHP, $ for USD, € for EUR, ¥ for JPY, etc. Default to ₱ if in the Philippines context.`;

      // Multi-model OCR pipeline with quota awareness
      let parsed: any = null;
      let lastError: any = null;
      let isRateLimited = false;
      let retryDelaySeconds = 20;

      const parseErrorForRateLimit = (err: any) => {
        const msg = String(err?.message || err || "");
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded") || msg.includes("quota")) {
          isRateLimited = true;
          const match = msg.match(/retry in ([0-9.]+)s/i) || msg.match(/"retryDelay":\s*"([0-9]+)s"/i);
          if (match && match[1]) {
            retryDelaySeconds = Math.ceil(parseFloat(match[1])) || 20;
          }
        }
      };

      const parseJsonFromText = (text: string) => {
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            try {
              return JSON.parse(jsonMatch[1]);
            } catch {
              return null;
            }
          }
          return null;
        }
      };

      const receiptProperties = {
        merchant: { type: Type.STRING, description: "Name of the restaurant or store" },
        total: { type: Type.NUMBER, description: "Total final payable amount on receipt" },
        subtotal: { type: Type.NUMBER, description: "Subtotal of all line items (VAT-inclusive in PH)" },
        currency: { type: Type.STRING, description: "Currency symbol like ₱, $, €, etc." },
        date: { type: Type.STRING, description: "Date YYYY-MM-DD" },
        category: { type: Type.STRING, description: "Category name" },
        tax: { type: Type.NUMBER, description: "Extra tax on top of subtotal (0.0 for Philippines where VAT is already in item SKUs)" },
        tip: { type: Type.NUMBER, description: "Service charge (SC) or tip amount added to bill" },
        discount: { type: Type.NUMBER, description: "Total discounts including PWD/Senior discount and VAT exemption deductions" },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Dish or item name" },
              price: { type: Type.NUMBER, description: "Line price (inclusive of VAT)" },
              quantity: { type: Type.NUMBER, description: "Quantity" },
            },
            required: ["name", "price"],
          },
          description: "Line items on receipt",
        },
        summary: { type: Type.STRING, description: "Brief summary of receipt" },
      };

      // Model 1: gemini-3.6-flash via Interactions API (Recommended primary model)
      try {
        const interaction = await ai.interactions.create({
          model: "gemini-3.6-flash",
          input: [
            {
              type: "image",
              mime_type: cleanMime,
              data: cleanBase64,
            },
            {
              type: "text",
              text: prompt,
            },
          ],
          response_format: {
            type: Type.OBJECT,
            properties: receiptProperties,
            required: ["merchant", "total", "currency", "items"],
          },
        });

        let text = interaction.output_text || "";
        if (!text && interaction.steps) {
          for (const step of interaction.steps) {
            if (step.type === "model_output" && Array.isArray(step.content)) {
              for (const part of step.content) {
                if ((part as any).type === "text" && typeof (part as any).text === "string") {
                  text += (part as any).text;
                }
              }
            }
          }
        }

        parsed = parseJsonFromText(text);
      } catch (err36: any) {
        console.warn("gemini-3.6-flash interactions failed:", err36?.message);
        lastError = err36;
        parseErrorForRateLimit(err36);
      }

      // Model 2: gemini-3.6-flash via generateContent (Direct model call)
      if (!parsed && !isRateLimited) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: cleanBase64,
                    },
                  },
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: receiptProperties,
                required: ["merchant", "total", "currency", "items"],
              },
              temperature: 0.1,
            },
          });

          parsed = parseJsonFromText(response.text || "");
        } catch (errGen36: any) {
          console.warn("gemini-3.6-flash generateContent failed:", errGen36?.message);
          lastError = errGen36;
          parseErrorForRateLimit(errGen36);
        }
      }

      // Model 3: gemini-3.7-flash via Interactions API (Secondary fallback)
      if (!parsed && !isRateLimited) {
        try {
          const interaction = await ai.interactions.create({
            model: "gemini-3.7-flash",
            input: [
              {
                type: "image",
                mime_type: cleanMime,
                data: cleanBase64,
              },
              {
                type: "text",
                text: prompt,
              },
            ],
            response_format: {
              type: Type.OBJECT,
              properties: receiptProperties,
              required: ["merchant", "total", "currency", "items"],
            },
          });

          let text = interaction.output_text || "";
          if (!text && interaction.steps) {
            for (const step of interaction.steps) {
              if (step.type === "model_output" && Array.isArray(step.content)) {
                for (const part of step.content) {
                  if ((part as any).type === "text" && typeof (part as any).text === "string") {
                    text += (part as any).text;
                  }
                }
              }
            }
          }

          parsed = parseJsonFromText(text);
        } catch (err37: any) {
          console.warn("gemini-3.7-flash interactions failed:", err37?.message);
          lastError = err37;
          parseErrorForRateLimit(err37);
        }
      }

      // Model 4: gemini-3.7-flash via generateContent
      if (!parsed && !isRateLimited) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.7-flash",
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: cleanBase64,
                    },
                  },
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          });

          parsed = parseJsonFromText(response.text || "");
        } catch (errGen37: any) {
          console.warn("gemini-3.7-flash generateContent failed:", errGen37?.message);
          lastError = errGen37;
          parseErrorForRateLimit(errGen37);
        }
      }

      if (isRateLimited && !parsed) {
        ocrRateLimitResetTime = Date.now() + retryDelaySeconds * 1000;
        return res.status(429).json({
          success: false,
          isRateLimit: true,
          retryAfter: retryDelaySeconds,
          error: `Gemini API Free Tier rate limit reached. Auto-ready in ${retryDelaySeconds}s, or enter dishes manually.`
        });
      }

      if (!parsed) {
        const cleanMsg = lastError?.message ? String(lastError.message).slice(0, 180) : "Could not extract receipt items.";
        throw new Error(cleanMsg);
      }

      return res.json({ success: true, receipt: parsed });
    } catch (err: any) {
      console.error("Receipt OCR Server Error:", err);
      return res.status(500).json({ 
        error: err.message || "Failed to scan receipt with Gemini Vision",
        details: String(err)
      });
    }
  });

  // Vite middleware for dev or static serving for prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Splitnest server running on http://localhost:${PORT}`);
  });
}

startServer();
