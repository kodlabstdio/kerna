import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { api, createLifecycle, setup, startHost } from "./native-fixture.mjs";
import { createRenderFixture } from "./editor-render-fixture.mjs";
import { packFixture } from "./packed-fixture.mjs";
import { proofPage } from "./editor-proof-data.mjs";

const index = process.argv.indexOf("--port");
const port = index < 0 ? 4327 : Number(process.argv[index + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Use --port with a port from 1024 to 65535.");
const lifecycle = createLifecycle();
const stop = async () => {
  await lifecycle.stop();
  process.exit();
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  const root = await createRenderFixture();
  await packFixture(root);
  const host = await startHost(root, false, lifecycle, port);
  if (new URL(host.origin).port !== String(port))
    throw new Error(`Requested port ${port} is unavailable.`);
  const { admin } = await setup(host.origin, 30_000);
  const created = await api(admin, "content/kerna_pages", {
    slug: "editor-proof",
    data: { title: "Nested proof Page", page: proofPage },
  });
  // Setup completes before this readiness route exists. Browser authentication
  // uses only the disposable host's normal dev-bypass, never a developer cookie.
  await writeFile(
    resolve(root, "src/proof/landing.astro"),
    `---
export const prerender = false;
---
<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>Task 13 integration proof</title></head>
<body><main><h1>Task 13 integration proof</h1><p>A disposable native EmDash host with a nested draft Page.</p>
<button id="open">Open editor</button><p id="status" role="status"></p></main>
<script is:inline>
document.getElementById("open").onclick = async () => {
  const response = await fetch("/_emdash/api/auth/dev-bypass", { method: "POST", headers: { "X-EmDash-Request": "1", "Content-Type": "application/json" }, body: "{}" });
  if (!response.ok) { document.getElementById("status").textContent = "Fixture sign-in failed."; return; }
  location.href = ${JSON.stringify(`/_emdash/admin/plugins/kerna/proof?id=${created.item.id}`)};
};
</script></body></html>`,
  );
  console.log(`Task 13 integration proof ready: ${host.origin}/__kerna-task13-proof`);
} catch (error) {
  await lifecycle.stop();
  console.error(error instanceof Error ? error.message : "Fixture setup failed.");
  process.exitCode = 1;
}
