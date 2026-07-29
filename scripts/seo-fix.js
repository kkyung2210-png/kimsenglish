const { runFix } = require("./seo-fix/fix-runner");

function parseOptions(args = process.argv.slice(2), environment = process.env) {
  const value = (name) => {
    const item = args.find((argument) => argument.startsWith(`--${name}=`));
    return item ? item.slice(name.length + 3) : environment[`npm_config_${name.replace(/-/g, "_")}`] || "";
  };
  const rollbackArg = args.find((argument) => argument === "--rollback" || argument.startsWith("--rollback="));
  const rollbackEnv = environment.npm_config_rollback;
  return {
    apply: args.includes("--apply") || environment.npm_config_apply === "true",
    strict: args.includes("--strict") || environment.npm_config_strict === "true",
    type: value("type"),
    page: value("page"),
    rollback: rollbackArg ? (rollbackArg.includes("=") ? rollbackArg.split("=").slice(1).join("=") : "") : (rollbackEnv === undefined ? undefined : rollbackEnv === "true" ? "" : rollbackEnv),
  };
}

function printResult(result) {
  if (result.mode === "dry-run") {
    console.log("\nSEO Fix Preview (dry-run)");
    console.log(`Issues: ${result.totalIssues.toLocaleString("en-US")}`);
    console.log(`Auto-fix actions: ${result.autoFixable.toLocaleString("en-US")}`);
    console.log(`Manual review: ${result.manualReview.toLocaleString("en-US")}`);
    console.log("원본과 dist는 수정하지 않았습니다.");
  } else if (result.mode === "rollback") {
    console.log(`\nRollback Complete: ${result.restoredBackupId}`);
    console.log(`Safety backup: ${result.safetyBackupId}`);
  } else {
    console.log("\nSEO Fix Complete");
    console.log(`Applied: ${result.applied}`);
    console.log(`Skipped: ${result.skipped}`);
    console.log(`Failed: ${result.failed}`);
    console.log(`Audit: ${result.auditBefore} → ${result.auditAfter}`);
  }
}

async function main() { printResult(await runFix(parseOptions())); }

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { parseOptions };
