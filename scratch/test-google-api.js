const apiKey = "AIzaSyBFC_YT5Obh9PdQk2LkREnHtVOy_GWtKPc";

async function testTranslation() {
  console.log("Testing Google Translate API...");
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: "नमस्ते",
      target: "en"
    })
  });
  console.log("Translate HTTP Status:", res.status);
  const data = await res.text();
  console.log("Translate Response:", data);
}

async function testSpeech() {
  console.log("\nTesting Google Speech-to-Text API...");
  const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: {
        encoding: "WEBM_OPUS",
        languageCode: "hi-IN"
      },
      audio: {
        content: ""
      }
    })
  });
  console.log("Speech HTTP Status:", res.status);
  const data = await res.text();
  console.log("Speech Response:", data);
}

async function run() {
  await testTranslation();
  await testSpeech();
}

run();
