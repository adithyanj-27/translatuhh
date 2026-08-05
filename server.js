import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const envPath = join(__dirname, ".env");
const envExamplePath = join(__dirname, ".env.example");

if (!existsSync(envPath) && existsSync(envExamplePath)) {
  try {
    const exampleContent = readFileSync(envExamplePath, "utf8");
    writeFileSync(envPath, exampleContent, "utf8");
  } catch (err) {
    console.error("Could not auto-create .env file:", err);
  }
}

if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
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
    original: "చూసినందుకు ధన్యவாదాలు.",
    translated: "Thank you for watching."
  }
];

let captionIndex = 0;

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
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

async function translateFree(text, targetLanguage) {
  try {
    const targetCode = googleLanguageCodes[targetLanguage] || "en";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetCode}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      let translated = "";
      if (Array.isArray(data?.[0])) {
        for (const sentence of data[0]) {
          if (sentence?.[0]) translated += sentence[0];
        }
      }
      const detectedLanguage = data?.[2] || "auto";
      if (translated) {
        return { translated, detectedLanguage };
      }
    }
  } catch (e) {
    console.error("Free translation fallback error:", e);
  }
  return { translated: text, detectedLanguage: "auto" };
}

async function translateWithGoogle(text, targetLanguage, apiKey, contextText = "") {
  try {
    const targetCode = googleLanguageCodes[targetLanguage] || "en";
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        target: targetCode
      })
    });

    if (response.ok) {
      const data = await response.json();
      const targetObj = data?.data?.translations?.[0];
      const translated = targetObj?.translatedText || text;
      const detectedLanguage = targetObj?.detectedSourceLanguage || "auto";
      return { translated, detectedLanguage };
    } else {
      console.warn("Google Translate API key failed, falling back to free endpoint:", response.status);
    }
  } catch (e) {
    console.warn("Google Translate API error, falling back to free endpoint:", e.message);
  }

  // Seamless fallback to free translation endpoint if API key is invalid/revoked
  return await translateFree(text, targetLanguage);
}

async function handleAudioChunk(request, response) {
  const body = await readRequestBody(request);
  const sourceLanguage = request.headers["x-source-language"] || "English";
  const targetLanguage = request.headers["x-target-language"] || "English";
  const contextText = request.headers["x-context-text"] || "";
  const encoding = request.headers["x-audio-encoding"] || "WEBM_OPUS";
  const sampleRate = parseInt(request.headers["x-audio-sample-rate"] || "48000", 10);
  const textInput = request.headers["x-text-transcript"];
  const apiKey = process.env.GOOGLE_API_KEY;

  const hasRealApiKey = Boolean(
    apiKey &&
    apiKey !== "your_google_api_key_here" &&
    apiKey.trim() !== ""
  );

  // Handle direct text transcript translation (from native browser speech recognition)
  if (textInput && textInput.trim()) {
    if (hasRealApiKey) {
      const translation = await translateWithGoogle(textInput.trim(), targetLanguage, apiKey, contextText);
      sendJson(response, 200, {
        id: randomUUID(),
        mode: "google-text",
        targetLanguage,
        detectedLanguage: translation.detectedLanguage || "auto",
        original: textInput.trim(),
        translated: translation.translated,
        createdAt: new Date().toISOString()
      });
      return;
    }
    const freeTranslation = await translateFree(textInput.trim(), targetLanguage);
    sendJson(response, 200, {
      id: randomUUID(),
      mode: "free-text",
      targetLanguage,
      detectedLanguage: freeTranslation.detectedLanguage || "auto",
      original: textInput.trim(),
      translated: freeTranslation.translated,
      createdAt: new Date().toISOString()
    });
    return;
  }

  if (hasRealApiKey) {
    if (body.length > 0) {
      const transcript = await transcribeWithGoogle(body, apiKey, sourceLanguage, encoding, sampleRate);
      if (transcript.original) {
        const translation = await translateWithGoogle(
          transcript.original,
          targetLanguage,
          apiKey,
          contextText
        );
        sendJson(response, 200, {
          id: randomUUID(),
          mode: "google",
          receivedBytes: body.length,
          targetLanguage,
          detectedLanguage: transcript.detectedLanguage || translation.detectedLanguage || "auto",
          original: transcript.original,
          translated: translation.translated,
          createdAt: new Date().toISOString()
        });
        return;
      }
    }
    // Return empty translation if silent chunk
    sendJson(response, 200, {
      id: randomUUID(),
      mode: "google",
      receivedBytes: body.length,
      targetLanguage,
      detectedLanguage: "auto",
      original: "",
      translated: "",
      createdAt: new Date().toISOString()
    });
    return;
  }

  const caption = demoLines[captionIndex % demoLines.length];
  captionIndex += 1;

  sendJson(response, 200, {
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
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(requestedPath)).replace(/^[/\\]+/, "");
  if (safePath.startsWith("..")) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  const filePath = join(publicDir, safePath);

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/status") {
      const apiKey = process.env.GOOGLE_API_KEY;
      sendJson(response, 200, {
        hasApiKey: Boolean(
          apiKey &&
          apiKey !== "your_google_api_key_here" &&
          apiKey.trim() !== ""
        ),
        provider: "Google Cloud Speech & Translate API"
      });
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/audio-chunk")) {
      await handleAudioChunk(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, {
      error: "Server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

server.listen(port, () => {
  console.log(`Translatuhh running at http://localhost:${port}`);
});
