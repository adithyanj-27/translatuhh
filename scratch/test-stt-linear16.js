const apiKey = "AIzaSyBFC_YT5Obh9PdQk2LkREnHtVOy_GWtKPc";

// Generate 2 seconds of 16kHz sine wave PCM audio
const sampleRate = 16000;
const durationSec = 2;
const numSamples = sampleRate * durationSec;
const buffer = Buffer.alloc(numSamples * 2 + 44);

// Write simple WAV header
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + numSamples * 2, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // Mono
buffer.writeUInt32LE(16000, 24);
buffer.writeUInt32LE(32000, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(numSamples * 2, 40);

for (let i = 0; i < numSamples; i++) {
  const s = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 32767;
  buffer.writeInt16LE(Math.floor(s), 44 + i * 2);
}

async function testSTT(encoding, sampleRateHertz, languageCode, altCodes) {
  console.log(`Testing Google STT: encoding=${encoding}, rate=${sampleRateHertz}, lang=${languageCode}, alt=${altCodes}`);
  const payload = {
    config: {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      alternativeLanguageCodes: altCodes
    },
    audio: {
      content: buffer.toString("base64")
    }
  };

  const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  console.log("Status:", res.status);
  const data = await res.text();
  console.log("Response:", data);
}

async function run() {
  await testSTT("LINEAR16", 16000, "hi-IN", ["en-US", "bn-IN"]);
  await testSTT("LINEAR16", 16000, "en-US", ["hi-IN"]);
}

run();
