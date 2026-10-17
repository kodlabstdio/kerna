import { afterEach, expect, test, vi } from "vite-plus/test";
import { renderPreview } from "../src/preview/render.ts";

afterEach(() => vi.useRealTimers());

function deferred() {
  let resolve!: (html: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const signal = () => new AbortController().signal;

test("native response slots cover body settlement and preserve response policy", async () => {
  vi.useFakeTimers();
  const streams = [new TransformStream<Uint8Array>(), new TransformStream<Uint8Array>()];
  const writers = streams.map((stream) => stream.writable.getWriter());
  const pending = streams.map((stream) =>
    renderPreview(async () => new Response(stream.readable), signal()),
  );
  try {
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await Promise.all(pending)).map((response) => response.status)).toEqual([504, 504]);
    expect((await renderPreview(async () => "busy", signal())).status).toBe(503);
    await Promise.all(writers.map((writer) => writer.close()));
    await vi.advanceTimersByTimeAsync(0);
    const recovered = await renderPreview(
      async () =>
        new Response("document", {
          headers: { "Content-Security-Policy": "frame-ancestors 'self'" },
        }),
      signal(),
    );
    expect(await recovered.text()).toBe("document");
    expect(recovered.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    expect(recovered.headers.get("Cache-Control")).toBe("no-store");
  } finally {
    await Promise.all(writers.map((writer) => writer.close().catch(() => {})));
    await vi.advanceTimersByTimeAsync(0);
  }
});

test("timeouts retain both actual render slots until settlement, then recover", async () => {
  vi.useFakeTimers();
  const first = deferred();
  const second = deferred();
  const pending = [
    renderPreview(() => first.promise, signal()),
    renderPreview(() => second.promise, signal()),
  ];
  let ended = false;
  const responses = Promise.all(pending).then((value) => {
    ended = true;
    return value;
  });
  const queued = vi.fn(async () => "must not render");
  try {
    const busy = await renderPreview(queued, signal());
    expect(busy.status).toBe(503);
    expect(busy.headers.get("Retry-After")).toBe("1");
    expect(busy.headers.get("Cache-Control")).toBe("no-store");
    expect(queued).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(ended).toBe(false);
    expect((await renderPreview(queued, signal())).status).toBe(503);
    await vi.advanceTimersByTimeAsync(1);
    expect((await responses).map((response) => response.status)).toEqual([504, 504]);
    expect((await renderPreview(queued, signal())).status).toBe(503);
    expect(queued).not.toHaveBeenCalled();
    first.resolve("late private content");
    await first.promise;
    await vi.advanceTimersByTimeAsync(0);
    expect((await renderPreview(async () => "current", signal())).status).toBe(200);
    // A rejected late render must release its slot without an unhandled rejection.
    second.reject(new Error("private runtime detail"));
    await vi.advanceTimersByTimeAsync(0);
    expect(await (await renderPreview(async () => "recovered", signal())).text()).toBe("recovered");
  } finally {
    first.resolve("");
    second.resolve("");
    await vi.advanceTimersByTimeAsync(0);
  }
});

test("completed synchronous work cancels its deadline before timer callbacks run", async () => {
  vi.useFakeTimers();
  const response = await renderPreview(async () => "Trusted render settled", signal());
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("Trusted render settled");
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(response.status).toBe(200);
});

test("request cancellation neither cancels work nor affects another request", async () => {
  const first = deferred();
  const second = deferred();
  const controller = new AbortController();
  const a = renderPreview(() => first.promise, controller.signal);
  const b = renderPreview(() => second.promise, signal());
  try {
    controller.abort();
    expect((await a).status).toBe(499);
    expect((await renderPreview(async () => "queued", signal())).status).toBe(503);
    second.resolve("other session");
    expect(await (await b).text()).toBe("other session");
    expect(await (await renderPreview(async () => "new session", signal())).text()).toBe(
      "new session",
    );
  } finally {
    first.resolve("cancelled session");
    second.resolve("");
    await Promise.all([a, b]);
  }
});

test("an already cancelled request never starts work", async () => {
  const render = vi.fn(async () => "private");
  const controller = new AbortController();
  controller.abort();
  expect((await renderPreview(render, controller.signal)).status).toBe(499);
  expect(render).not.toHaveBeenCalled();
});

test("the output limit counts UTF-8 bytes and accepts the exact boundary", async () => {
  const exact = "😀".repeat(1_000_000);
  const accepted = await renderPreview(async () => exact, signal());
  expect(accepted.status).toBe(200);
  expect((await accepted.arrayBuffer()).byteLength).toBe(4_000_000);
  const rejected = await renderPreview(async () => `${exact}a`, signal());
  expect(rejected.status).toBe(413);
  expect(await rejected.text()).not.toContain("😀");
  expect((await renderPreview(async () => "after output rejection", signal())).status).toBe(200);
});

test("synchronous throws and asynchronous failures have safe responses and release capacity", async () => {
  for (const render of [
    () => {
      throw new Error("private Component source");
    },
    () => Promise.reject(new Error("private Component source")),
  ]) {
    const response = await renderPreview(render, signal());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private Component source");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
  expect((await renderPreview(async () => "after failures", signal())).status).toBe(200);
});
