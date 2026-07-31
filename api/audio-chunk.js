import { randomUUID } from "node:crypto";

export const config = {
  api: {
    bodyParser: false
  }
};

const googleLanguageCodes = {
  English: "en",
  Hindi: "hi",
  Bengali: "bn",
  Gujarati: "gu",
  Kannada: "kn",
  Malayalam: "ml",
  Marathi: "mr",
  Odia: "or",
  Punjabi: "pa",
  Tamil: "ta",
  Telugu: "te",
  Assamese: "as",
  Nepali: "ne",
  Urdu: "ur",
  Spanish: "es",
  French: "fr",
  German: "de",
  Japanese: "ja",
  Chinese: "zh"
};

const demoLines = [
  {
    detectedLanguage: "hi",
    original: "नमस्ते, यह एक लाइव वीडियो है।",
    translated: "Hello, this is a live video."
  },
  {
    detectedLanguage: "ta",
    original: "இப்போது என்ன நடக்கிறது என்பதை பார்க்கலாம்.",
    translated: "Now let's see what is happening."
  },
  {
    detectedLanguage: "te",
    original: "చూసినందుకు ధన్యవాదాలు.",
    translated: "Thank you for watching."
  }
];

let captionIndex = 0;

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function transcribeWithGoogle(audioBuffer, apiKey) {
  const base64Audio = audioBuffer.toString("base64");
  
  const response = await fetch(
    `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          encoding: "WEBM_OPUS",
          sampleRateHertz: 48000,
          languageCode: "en-US",
          alternativeLanguageCodes: [
            "hi-IN", "ta-IN", "te-IN", "bn-IN", "gu-IN", 
            "mr-IN", "ml-IN", "kn-IN", "es-ES", "fr-FR", "de-DE"
          ]
        },
        audio: {
          content: base64Audio
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Speech STT error:", errorText);
    return { original: "", detectedLanguage: "auto" };
  }

  const data = await response.json();
  const transcript = data.results?.[0]?.alternatives?.[0]?.transcript?.trim() || "";
  const detectedLanguage = data.results?.[0]?.languageCode || "auto";

  return { original: transcript, detectedLanguage };
}

async function translateWithGoogle(text, targetLanguage, apiKey) {
  const targetCode = googleLanguageCodes[targetLanguage] || "en";

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        target: targetCode,
        format: "text"
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Translate error:", errorText);
    return { translated: text, detectedLanguage: "auto" };
  }

  const data = await response.json();
  const translated = data.data?.translations?.[0]?.translatedText || text;
  const detectedLanguage = data.data?.translations?.[0]?.detectedSourceLanguage || "auto";

  return { translated, detectedLanguage };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = await readRequestBody(req);
    const targetLanguage = req.headers["x-target-language"] || "English";
    const apiKey = process.env.GOOGLE_API_KEY;

    const hasRealApiKey = Boolean(
      apiKey &&
      apiKey !== "your_google_api_key_here" &&
      apiKey.trim() !== ""
    );

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    if (hasRealApiKey) {
      if (body.length > 0) {
        // 1. Transcribe audio with Google Speech-to-Text
        const transcript = await transcribeWithGoogle(body, apiKey);

        if (transcript.original) {
          // 2. Translate text with Google Translation API
          const translation = await translateWithGoogle(
            transcript.original,
            targetLanguage,
            apiKey
          );

          return res.status(200).json({
            id: randomUUID(),
            mode: "google",
            receivedBytes: body.length,
            targetLanguage,
            detectedLanguage: transcript.detectedLanguage || translation.detectedLanguage || "auto",
            original: transcript.original,
            translated: translation.translated,
            createdAt: new Date().toISOString()
          });
        }
      }

      // Return empty translation if silent chunk
      return res.status(200).json({
        id: randomUUID(),
        mode: "google",
        receivedBytes: body.length,
        targetLanguage,
        detectedLanguage: "auto",
        original: "",
        translated: "",
        createdAt: new Date().toISOString()
      });
    }

    // Fallback to Demo Mode ONLY if API key is not configured
    const caption = demoLines[captionIndex % demoLines.length];
    captionIndex += 1;

    return res.status(200).json({
      id: randomUUID(),
      mode: "demo",
      receivedBytes: body.length,
      targetLanguage,
      detectedLanguage: caption.detectedLanguage,
      original: caption.original,
      translated:
        targetLanguage === "English"
          ? caption.translated
          : `[${targetLanguage}] ${caption.translated}`,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({
      error: "Server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
