// Google's DESIGN.md linter exits non-zero only on errors; contrast problems are warnings.
// Fail on both, so every DESIGN.md stays AA-clean.
import { execFileSync } from "node:child_process";

const files = process.argv.slice(2);
let failed = false;

for (const file of files) {
  let output;
  try {
    output = execFileSync("design.md", ["lint", file], { encoding: "utf8" });
  } catch (error) {
    output = error.stdout;
  }
  const { findings, summary } = JSON.parse(output);
  for (const finding of findings.filter((f) => f.severity !== "info")) {
    console.error(
      `${file}: ${finding.severity} ${finding.rule ?? ""} ${finding.path ?? ""} ${finding.message}`,
    );
  }
  failed ||= summary.errors > 0 || summary.warnings > 0;
  console.log(`${file}: ${summary.errors} errors, ${summary.warnings} warnings`);
}

process.exit(failed ? 1 : 0);
