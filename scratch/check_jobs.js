const runsUrl = "https://api.github.com/repos/adithyanj-27/translatuhh/actions/runs?per_page=5";

async function main() {
  try {
    const runsRes = await fetch(runsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const runsData = await runsRes.json();
    console.log("=== RUNS ===");
    for (const run of runsData.workflow_runs || []) {
      console.log(`Run ID: ${run.id} - Event: ${run.event} - Status: ${run.status} - Conclusion: ${run.conclusion} - Commit: ${run.head_commit?.message}`);
    }
  } catch (err) {
    console.error(err);
  }
}

main();
