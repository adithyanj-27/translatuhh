const runId = "30684921572";
const url = `https://api.github.com/repos/adithyanj-27/translatuhh/actions/runs/${runId}/jobs`;

async function main() {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await res.json();
    for (const job of data.jobs || []) {
      if (job.conclusion === "failure") {
        console.log(`Job ID: ${job.id}`);
        // Fetch logs
        const logRes = await fetch(`https://api.github.com/repos/adithyanj-27/translatuhh/actions/jobs/${job.id}/logs`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const logsText = await logRes.text();
        console.log("=== LOGS ===");
        // Log text contains timestamped lines. Let's find where the sync step fails.
        // We'll print the last 150 lines of logs to locate the error.
        const lines = logsText.split("\n");
        const startIndex = Math.max(0, lines.length - 150);
        console.log(lines.slice(startIndex).join("\n"));
      }
    }
  } catch (err) {
    console.error(err);
  }
}

main();
