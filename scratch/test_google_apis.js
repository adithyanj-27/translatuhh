import fs from "fs";

let apiKey = "";
try {
  const envText = fs.readFileSync(".env", "utf8");
  const match = envText.match(/GOOGLE_API_KEY=(.*)/);
  if (match) apiKey = match[1].trim();
} catch (e) {}

async function testContextTranslation() {
  console.log("Testing array context translation with Google Translate API...");
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: ["കടന്നു കയറുന്ന ആൾ", "അയാൾ വീട്ടിലേക്ക് പ്രവേശിച്ചു"],
      target: "en",
      format: "text"
    })
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Result:", JSON.stringify(data, null, 2));
}

testContextTranslation();
