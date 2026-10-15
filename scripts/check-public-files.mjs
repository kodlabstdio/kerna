import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0");
const privatePaths = tracked.filter(
  (path) =>
    path.startsWith("docs/") ||
    /(?:^|\/)(?:\.agents|\.claude|\.codex|\.cursor|\.github)\/skills(?:\/|$)/.test(path),
);
if (privatePaths.length) {
  console.error("Private files must stay outside Git:\n" + privatePaths.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Publication boundary: no root docs/ or local skill files are tracked.");
}
