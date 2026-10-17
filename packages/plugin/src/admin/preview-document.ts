import type { PreviewBinding } from "./preview-channel.ts";

// Parse inertly before srcdoc: Astro development includes HMR/style modules
// alongside its already compiled CSS. Only the per-response bridge executes in
// preview; keep the document, CSS and asset URLs exactly as the host emitted them.
export function previewDocument(html: string, binding: PreviewBinding): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const bridges = [...document.querySelectorAll("script[data-kerna-bridge]")].filter(
    (script) =>
      script.getAttribute("data-kerna-bridge") === binding.token && script.hasAttribute("nonce"),
  );
  if (bridges.length !== 1) throw new Error("Preview bridge is unavailable.");
  for (const script of document.querySelectorAll("script")) {
    if (script !== bridges[0]) script.remove();
  }
  return `<!doctype html>${document.documentElement.outerHTML}`;
}
