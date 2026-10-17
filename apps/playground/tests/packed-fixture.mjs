import { execFileSync } from "node:child_process";
import { mkdir, readdir, symlink, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
// Use the task's executable, not a particular user's Vite+ cache layout.
// Packing uses installed dependencies only; never auto-download another CLI.
const pnpm = process.env.npm_execpath?.includes("pnpm") ? process.env.npm_execpath : "pnpm";

// Actual package tarballs, with already-installed external dependencies. This
// performs no installation, network fetch, or mutation of workspace links.
export async function packFixture(root) {
  const packed = resolve(root, "packed");
  await mkdir(packed);
  const names = { core: "kerna-core", components: "kerna-components", plugin: "kerna" };
  for (const name of Object.keys(names)) {
    const directory = resolve(packed, name);
    await mkdir(directory);
    execFileSync(
      pnpm,
      [
        "--pm-on-fail=ignore",
        "pack",
        "--pack-destination",
        directory,
        "--userconfig",
        "/dev/null",
        "--state-dir",
        resolve(packed, "state"),
        "--store-dir",
        resolve(packed, "store"),
      ],
      {
        cwd: resolve(repo, "packages", name),
        timeout: 30_000,
        stdio: "pipe",
      },
    );
    const archive = (await readdir(directory)).find((file) => file.endsWith(".tgz"));
    if (!archive) throw new Error(`No package archive produced for ${name}.`);
    execFileSync("tar", ["-xzf", resolve(directory, archive), "-C", directory], {
      timeout: 30_000,
    });
  }
  await unlink(resolve(root, "node_modules")); // This fixture's own temporary symlink only.
  await mkdir(resolve(root, "node_modules"));
  const linked = new Set();
  for (const source of ["apps/playground/node_modules", "packages/plugin/node_modules"]) {
    for (const entry of await readdir(resolve(repo, source))) {
      if (entry === "@kodlab") continue;
      if (entry.startsWith("@")) {
        await mkdir(resolve(root, "node_modules", entry), { recursive: true });
        for (const child of await readdir(resolve(repo, source, entry))) {
          const name = `${entry}/${child}`;
          if (linked.has(name)) continue;
          await symlink(resolve(repo, source, name), resolve(root, "node_modules", name));
          linked.add(name);
        }
      } else if (!linked.has(entry)) {
        await symlink(resolve(repo, source, entry), resolve(root, "node_modules", entry));
        linked.add(entry);
      }
    }
  }
  await mkdir(resolve(root, "node_modules/@kodlab"));
  for (const [name, packageName] of Object.entries(names))
    await symlink(
      resolve(packed, name, "package"),
      resolve(root, "node_modules/@kodlab", packageName),
    );
  return packed;
}
