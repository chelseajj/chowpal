// /api/gemini.js — Vercel Serverless Function
// Gemini API key stays here (server-side), users never see it

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Simple in-memory rate limiter (resets on cold start, good enough for MVP)
const rateLimit = new Map();
const LIMIT_PER_HOUR = 30; // per IP

function checkRate(ip) {
  const now = Date.now();
  const record = rateLimit.get(ip) || { count: 0, resetAt: now + 3600000 };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + 3600000; }
  record.count++;
  rateLimit.set(ip, record);
  return record.count <= LIMIT_PER_HOUR;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Rate limit
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
  if (!checkRate(ip)) return res.status(429).json({ error: "Too many requests. Try again in an hour." });

  // Get API key from Vercel environment variable
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server not configured" });

  try {
    const { action, image, mimeType, restaurantName, city } = req.body;

    let body;

    if (action === "ocr") {
      // OCR: extract restaurant info from screenshot
      body = {
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType || "image/jpeg", data: image } },
            { text: `Extract restaurant info from this Chinese app screenshot (Dianping/Meituan/Xiaohongshu). Return ONLY raw JSON, no markdown:\n{"name":"Chinese restaurant name","address":"full Chinese address","city":"city name","rating":4.5,"avg_price":88}\nIf cannot identify: {"error":"cannot read"}` },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
      };
    } else if (action === "recommend") {
      // Recommendations: search for dishes + reviews
      body = {
        contents: [{
          parts: [{
            text: `Search for restaurant "${restaurantName}" in ${city || "上海"}, China. Find its Dianping rating, full address with GPS coordinates, popular dishes with prices, and Xiaohongshu reviews.

Return ONLY raw JSON (no markdown):
{
  "restaurant": {
    "name": "${restaurantName}",
    "address": "full Chinese address with city/district/street/number",
    "lat": 31.22, "lng": 121.47,
    "rating_dianping": 4.5, "total_reviews": 2000, "avg_price": 88,
    "tags": ["tag1", "tag2"],
    "highlights": ["1-2 sentence English summary"],
    "tips": ["practical English tip"]
  },
  "recommended_dishes": [
    {"name":"Chinese name","name_en":"English","price":38,"rating":9.5,"recommend_count":328,"reason":"English reason","tags":["must-try"],"is_vegetarian":false,"source":"大众点评/小红书"}
  ],
  "xiaohongshu_highlights": [
    {"summary":"English summary","sentiment":"positive"}
  ]
}
Include accurate lat/lng and address for Didi ride link. Find 5-8 dishes with real prices.`
          }],
        }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
      };
    } else {
      return res.status(400).json({ error: "Invalid action. Use 'ocr' or 'recommend'" });
    }

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || "Gemini API error" });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join("") || "";

    // Try to parse JSON from response
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      const json = JSON.parse(cleaned);
      return res.status(200).json(json);
    } catch {
      // Try extracting JSON from mixed text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return res.status(200).json(JSON.parse(match[0]));
      return res.status(200).json({ raw: text, error: "Could not parse structured response" });
    }
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
