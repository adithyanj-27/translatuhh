export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  const hasApiKey = Boolean(
    apiKey &&
    apiKey !== "your_google_api_key_here" &&
    apiKey.trim() !== ""
  );

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  
  return res.status(200).json({
    hasApiKey,
    provider: "Google Cloud Speech & Translate API"
  });
}
