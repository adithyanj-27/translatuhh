import fs from "fs";

let apiKey = "";
try {
  const envText = fs.readFileSync(".env", "utf8");
  const match = envText.match(/GOOGLE_API_KEY=(.*)/);
  if (match) apiKey = match[1].trim();
} catch (e) {}

function createWavBuffer(sampleRate = 16000, durationSec = 2) {
  const numSamples = sampleRate * durationSec;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true);  // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Fill with a gentle 440Hz sine wave tone
  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
  }

  return Buffer.from(buffer);
}

async function testWavSpeech() {
  const wavBuffer = createWavBuffer(16000, 2);
  const base64Audio = wavBuffer.toString("base64");

  console.log("Testing 16kHz LINEAR16 WAV with Google Speech-to-Text...");
  const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: "ml-IN"
      },
      audio: {
        content: base64Audio
      }
    })
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Result:", JSON.stringify(data, null, 2));
}

testWavSpeech();
