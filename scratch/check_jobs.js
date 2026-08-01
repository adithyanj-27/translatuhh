const runsUrl = "https://api.github.com/repos/adithyanj-27/translatuhh/actions/runs?per_page=1";

async function main() {
  try {
    const runsRes = await fetch(runsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const runsData = await runsRes.json();
    const latestRun = runsData.workflow_runs?.[0];
    
    if (!latestRun) {
      console.log("No runs found.");
      return;
    }

    console.log(`Latest Run ID: ${latestRun.id} (${latestRun.status})`);
    
    const jobsRes = await fetch(latestRun.jobs_url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const jobsData = await jobsRes.json();
    console.log("\n=== JOBS ===");
    for (const job of jobsData.jobs || []) {
      console.log(`Job: ${job.name} - Status: ${job.status} - Conclusion: ${job.conclusion}`);
      for (const step of job.steps || []) {
        console.log(`  Step: ${step.name} - Status: ${step.status} - Conclusion: ${step.conclusion}`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

main();
