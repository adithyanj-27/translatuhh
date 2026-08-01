import fs from "fs";

let apiKey = "";
try {
  const envText = fs.readFileSync(".env", "utf8");
  const match = envText.match(/GOOGLE_API_KEY=(.*)/);
  if (match) apiKey = match[1].trim();
} catch (e) {}

console.log("Testing full pipeline with key:", apiKey ? apiKey.substring(0, 10) + "..." : "NONE");

async function testFullPipeline() {
  // 1-second sample silent/test PCM buffer
  const sampleAudio = Buffer.alloc(48000 * 2); // 1 sec of 16-bit mono 48kHz PCM
  const base64Audio = sampleAudio.toString("base64");

  console.log("\n1. Testing Speech-to-Text with audio buffer...");
  const speechRes = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 48000,
        languageCode: "en-US"
      },
      audio: {
        content: base64Audio
      }
    })
  });

  console.log("Speech-to-Text HTTP Status:", speechRes.status);
  const speechData = await speechRes.json();
  console.log("Speech Result:", JSON.stringify(speechData, null, 2));

  console.log("\n2. Testing Translation...");
  const transRes = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: "Testing live system audio translation",
      target: "hi",
      format: "text"
    })
  });

  console.log("Translation HTTP Status:", transRes.status);
  const transData = await transRes.json();
  console.log("Translation Result:", JSON.stringify(transData, null, 2));
}

testFullPipeline();
