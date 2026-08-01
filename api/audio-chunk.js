import { randomUUID } from "node:crypto";

export const config = {
  api: {
    bodyParser: false
  }
};

const googleSpeechLanguageCodes = {
  English: "en-US",
  Hindi: "hi-IN",
  Bengali: "bn-IN",
  Gujarati: "gu-IN",
  Kannada: "kn-IN",
  Malayalam: "ml-IN",
  Marathi: "mr-IN",
  Odia: "or-IN",
  Punjabi: "pa-IN",
  Tamil: "ta-IN",
  Telugu: "te-IN",
  Assamese: "as-IN",
  Nepali: "ne-NP",
  Urdu: "ur-IN",
  Spanish: "es-ES",
  French: "fr-FR",
  German: "de-DE",
  Japanese: "ja-JP",
  Chinese: "zh-CN"
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

async function transcribeWithGoogle(audioBuffer, apiKey, sourceLanguage, encoding = "WEBM_OPUS", sampleRate = 48000) {
  const base64Audio = audioBuffer.toString("base64");
  const speechCode = googleSpeechLanguageCodes[sourceLanguage] || "en-US";
  const alternativeCodes = ["en-US", "hi-IN", "bn-IN", "ta-IN", "te-IN", "es-ES"].filter(code => code !== speechCode);

  const config = {
    encoding: encoding,
    languageCode: speechCode,
    alternativeLanguageCodes: alternativeCodes
  };

  // Google STT API v1 rule: sampleRateHertz MUST NOT be set when encoding is WEBM_OPUS or OGG_OPUS
  if (encoding !== "WEBM_OPUS" && encoding !== "OGG_OPUS") {
    config.sampleRateHertz = sampleRate;
  }

  const response = await fetch(
    `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: config,
        audio: {
          content: base64Audio
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Google Speech STT error:", errorText);
    return { original: "", detectedLanguage: speechCode };
  }

  const data = await response.json();
  const transcript = data.results?.[0]?.alternatives?.[0]?.transcript?.trim() || "";
  const detectedLanguage = data.results?.[0]?.languageCode || speechCode;

  return { original: transcript, detectedLanguage };
}

async function translateWithGoogle(text, targetLanguage, apiKey, contextText = "") {
  const targetCode = googleLanguageCodes[targetLanguage] || "en";
  const queryPayload = contextText ? [contextText, text] : text;

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: queryPayload,
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
  const translations = data.data?.translations || [];
  const targetObj = translations.length > 1 ? translations[1] : translations[0];

  const translated = targetObj?.translatedText || text;
  const detectedLanguage = targetObj?.detectedSourceLanguage || "auto";

  return { translated, detectedLanguage };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = await readRequestBody(req);
    const sourceLanguage = req.headers["x-source-language"] || "English";
    const targetLanguage = req.headers["x-target-language"] || "English";
    const contextText = req.headers["x-context-text"] || "";
    const encoding = req.headers["x-audio-encoding"] || "WEBM_OPUS";
    const sampleRate = parseInt(req.headers["x-audio-sample-rate"] || "48000", 10);
    const textInput = req.headers["x-text-transcript"];
    const apiKey = process.env.GOOGLE_API_KEY;

    const hasRealApiKey = Boolean(
      apiKey &&
      apiKey !== "your_google_api_key_here" &&
      apiKey.trim() !== ""
    );

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    // Handle direct text transcript translation (from native browser speech recognition)
    if (textInput && textInput.trim()) {
      if (hasRealApiKey) {
        const translation = await translateWithGoogle(textInput.trim(), targetLanguage, apiKey, contextText);
        return res.status(200).json({
          id: randomUUID(),
          mode: "google-text",
          targetLanguage,
          detectedLanguage: translation.detectedLanguage || "auto",
          original: textInput.trim(),
          translated: translation.translated,
          createdAt: new Date().toISOString()
        });
      }
      return res.status(200).json({
        id: randomUUID(),
        mode: "demo-text",
        targetLanguage,
        detectedLanguage: "auto",
        original: textInput.trim(),
        translated: `[${targetLanguage}] ${textInput.trim()}`,
        createdAt: new Date().toISOString()
      });
    }

    if (hasRealApiKey) {
      if (body.length > 0) {
        // 1. Transcribe audio with Google Speech-to-Text
        const transcript = await transcribeWithGoogle(body, apiKey, sourceLanguage, encoding, sampleRate);

        if (transcript.original) {
          // 2. Translate text with Google Translation API
          const translation = await translateWithGoogle(
            transcript.original,
            targetLanguage,
            apiKey,
            contextText
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
