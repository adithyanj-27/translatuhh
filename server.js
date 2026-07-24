import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

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

const demoLines = [
  {
    detectedLanguage: "hi-IN",
    original: "नमस्ते, यह एक लाइव वीडियो है।",
    translated: "Hello, this is a live video."
  },
  {
    detectedLanguage: "ta-IN",
    original: "இப்போது என்ன நடக்கிறது என்பதை பார்க்கலாம்.",
    translated: "Now let's see what is happening."
  },
  {
    detectedLanguage: "te-IN",
    original: "చూసినందుకు ధన్యవాదాలు.",
    translated: "Thank you for watching."
  }
];

let captionIndex = 0;

const languageCodes = {
  Assamese: "as-IN",
  Bengali: "bn-IN",
  Bodo: "brx-IN",
  Dogri: "doi-IN",
  English: "en-IN",
  Gujarati: "gu-IN",
  Hindi: "hi-IN",
  Kannada: "kn-IN",
  Kashmiri: "ks-IN",
  Konkani: "kok-IN",
  Maithili: "mai-IN",
  Malayalam: "ml-IN",
  Manipuri: "mni-IN",
  Marathi: "mr-IN",
  Nepali: "ne-IN",
  Odia: "od-IN",
  Punjabi: "pa-IN",
  Sanskrit: "sa-IN",
  Santali: "sat-IN",
  Sindhi: "sd-IN",
  Tamil: "ta-IN",
  Telugu: "te-IN",
  Urdu: "ur-IN"
};

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

async function handleAudioChunk(request, response) {
  const body = await readRequestBody(request);
  const targetLanguage = request.headers["x-target-language"] || "English";

  const hasRealApiKey = process.env.SARVAM_API_KEY &&
                        process.env.SARVAM_API_KEY !== "your_sarvam_api_key_here" &&
                        process.env.SARVAM_API_KEY.trim() !== "";

  if (hasRealApiKey) {
    const transcript = await transcribeWithSarvam(body, request.headers["content-type"]);
    if (transcript.original) {
      const translation = await translateWithSarvam(
        transcript.original,
        transcript.detectedLanguage,
        targetLanguage
      );
      sendJson(response, 200, {
        id: crypto.randomUUID(),
        mode: "sarvam",
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

  const caption = demoLines[captionIndex % demoLines.length];
  captionIndex += 1;

  // This is the exact integration boundary for a real STT + translation service.
  // Replace the demo response with a call that transcribes `body`, detects language,
  // translates to `targetLanguage`, then returns the same JSON shape.
  sendJson(response, 200, {
    id: crypto.randomUUID(),
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

async function transcribeWithSarvam(audioBuffer, contentType = "audio/webm") {
  const form = new FormData();
  const blob = new Blob([audioBuffer], {
    type: contentType?.split(";")[0] || "audio/webm"
  });

  form.append("file", blob, "chunk.webm");
  form.append("model", "saaras:v3");
  form.append("mode", "transcribe");
  form.append("language_code", "unknown");

  const sarvamResponse = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": process.env.SARVAM_API_KEY
    },
    body: form
  });

  if (!sarvamResponse.ok) {
    const errorText = await sarvamResponse.text();
    throw new Error(`Sarvam speech-to-text failed with ${sarvamResponse.status}: ${errorText}`);
  }

  const result = await sarvamResponse.json();
  const original = result?.transcript?.trim() || "";
  const detectedLanguage = result?.language_code || "auto";

  return { original, detectedLanguage };
}

async function translateWithSarvam(text, sourceLanguageCode, targetLanguage) {
  const targetCode = languageCodes[targetLanguage] || "en-IN";
  const sourceCode = sourceLanguageCode || "auto";

  if (sourceCode === targetCode) {
    return {
      translated: text,
      detectedLanguage: sourceCode
    };
  }

  const sarvamResponse = await fetch("https://api.sarvam.ai/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": process.env.SARVAM_API_KEY
    },
    body: JSON.stringify({
      input: text,
      source_language_code: sourceCode,
      target_language_code: targetCode,
      model: "sarvam-translate:v1"
    })
  });

  if (!sarvamResponse.ok) {
    const errorText = await sarvamResponse.text();
    throw new Error(`Sarvam translate failed with ${sarvamResponse.status}: ${errorText}`);
  }

  const result = await sarvamResponse.json();
  return {
    detectedLanguage: result?.source_language_code || sourceCode,
    translated: result?.translated_text || text
  };
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
      sendJson(response, 200, {
        hasApiKey: Boolean(
          process.env.SARVAM_API_KEY &&
          process.env.SARVAM_API_KEY !== "your_sarvam_api_key_here" &&
          process.env.SARVAM_API_KEY.trim() !== ""
        )
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
