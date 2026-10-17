---
title: Trusted Astro rendering
description: The host compilation boundary and resource limits for private Page previews.
---

Kerna Components are trusted, installed Astro code. The site compiles them; Page JSON cannot register executable Components. Public Pages remain ordinary Astro HTML and CSS.

## Host integration

The optional `@kodlab/kerna/astro` integration adds the private route at `/_emdash/api/kerna-preview`. It generates ordinary Astro route and middleware entry files in the host's Astro cache. The route statically imports the host's configured Document. The same Document renders public Pages and private drafts; renderer modules and functions are compiled by Astro and are never placed in JSON plugin configuration or selected by a request.

Configure `kernaAstro({ document, components, designSystem })` beside the native `kerna({ components, designSystem, presets })` plugin. The middleware checks EmDash `schema:read` permission, the request marker and Origin, JSON content type, the 1,004,096-byte stream cap, the exact request envelope, native access to the existing `kerna_pages` item and core Page validation before calling Astro's `next()`. The document receives the checked Page, a per-response nonce and the frame binding through request-local `locals`. The generated route preserves the host's compiled CSS and asset URLs.

Middleware must authenticate the native EmDash session, enforce editing permission and content access, check CSRF, bound the request body before parsing, and validate the Page against the enabled Design System **before** admitting rendering. It then wraps both `next()` and consumption of the returned response body. Returning response headers alone does not mean that asynchronous Components have finished.

The parent fetches HTML privately and places it in an iframe with `sandbox="allow-scripts"`; the frame receives no session credentials. The shared host Document must add a restrictive preview CSP and nonce-bound `frameBridge` from `@kodlab/kerna/preview`. Kerna strips other executable scripts before assigning `srcdoc`, while preserving document markup, styles and asset links. Host framing headers must survive the response path. A `frame-ancestors` meta tag cannot enforce framing policy in `srcdoc`.

Compiled assets must work from the frame's opaque origin. Public font responses need an appropriate CORS allow-origin header; the Node fixture adds that header only to its public font asset. Private preview and API responses do not receive public CORS access. A successful download alone does not establish parity: check actual font activation inside the frame for each deployment. Keep the isolated sandbox and the host's compiled CSS URLs.

## Resource limits

The render-budget helper admits two actual renders per host module instance and queues none. Excess requests receive a retryable `503`. A responsive event loop permits a best-effort 10-second asynchronous response budget. Timeout or request cancellation ends the response, but retains the slot until the underlying render and body consumption settle.

Output is limited to 4,000,000 UTF-8 bytes. The helper retains at most that much response data and drains an oversized stream without accumulating more chunks. It does not bound memory allocated by a Component or by the host renderer before those bytes arrive.

**Synchronous Component code can block the timer.** An in-process timeout cannot interrupt that code or guarantee an absolute wall-clock deadline. This is trusted host execution, not an execution sandbox. Deployment CPU limits and availability remain host responsibilities; the local Node fixture is not Cloudflare runtime evidence.

## Production preview regressions

The playground's native tests exercise the package route in development and production builds, including the packed plugin integration. They also check denied requests, nested synthetic Slots, CSS/assets, resource admission and output bounds. They use fresh local data and do not copy a developer's database.

For a disposable visual proof page, with repository dependencies prepared, run from the repository root:

```sh
node apps/playground/tests/editor-proof-server.mjs --port 4327
```

Open `http://127.0.0.1:4327/__kerna-task13-proof`. The runner creates a fresh local database and native development sessions, seeds a nested draft Page, and exposes readiness only after setup. It never copies the developer's database. Stop the foreground command to stop its owned Astro host.

This legacy proof runner is useful for focused adapter inspection. The product editor is registered on the native `/editor` admin page and is covered separately from the synthetic renderer fixture. Deployment-specific assets, actual browser checks, visual judgment and human accessibility review remain environment-specific verification.

The font fixture borrows installed Arial on macOS or DejaVu Sans on Linux inside its temporary host. It fails explicitly if neither is available and does not redistribute a font binary.
