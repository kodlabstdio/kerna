import { expect, test } from "vite-plus/test";
import { connectPreview, scrollMessage, selectionMessage } from "../src/admin/preview-channel.ts";

const binding = { token: "a".repeat(64), session: "session-a", generation: 3 };
const message = { ...binding, version: 1, type: "select", id: "nested" };
const ids = new Set(["nested"]);
test("scroll restoration accepts only finite coordinates from the current document", () => {
  const scroll = { ...binding, version: 1, type: "scroll", x: 2, y: 340 };
  expect(scrollMessage(scroll, binding)).toEqual({ x: 2, y: 340 });
  for (const invalid of [
    null,
    {},
    { ...scroll, y: Infinity },
    { ...scroll, x: -1 },
    { ...scroll, y: 10_000_001 },
    { ...scroll, type: "restore-scroll" },
    { ...scroll, token: "forged" },
    { ...scroll, session: "other" },
    { ...scroll, generation: 2 },
    { ...scroll, extra: true },
  ])
    expect(scrollMessage(invalid, binding)).toBeUndefined();
});
test("only the current channel binding and current Block IDs select", () => {
  expect(selectionMessage(message, binding, ids)).toBe("nested");
  for (const invalid of [
    null,
    "message",
    {},
    { ...message, token: "forged" },
    { ...message, session: "session-b" },
    { ...message, generation: 2 },
    { ...message, version: 2 },
    { ...message, id: "removed" },
    { ...message, type: "save" },
    { ...message, extra: true },
  ])
    expect(selectionMessage(invalid, binding, ids)).toBeUndefined();
  expect(selectionMessage(message, { ...binding, generation: 4 }, ids)).toBeUndefined();
});

test("a transferred channel selects only until its document is disposed", async () => {
  let port!: MessagePort;
  const selected: string[] = [];
  const scrolled: unknown[] = [];
  const frame = {
    contentWindow: {
      postMessage(data: unknown, origin: string, transfer: MessagePort[]) {
        expect(data).toEqual({ ...binding, version: 1, type: "connect" });
        expect(origin).toBe("*");
        expect(transfer).toHaveLength(1);
        port = transfer[0]!;
      },
    },
  } as unknown as HTMLIFrameElement;
  const connected = connectPreview(
    frame,
    binding,
    ids,
    (id) => selected.push(id),
    (position) => scrolled.push(position),
  );
  try {
    const highlighted = new Promise((resolve) => {
      port.onmessage = (event) => resolve(event.data);
    });
    connected.highlight("nested");
    expect(await highlighted).toEqual({ ...binding, version: 1, type: "highlight", id: "nested" });
    const restored = new Promise((resolve) => {
      port.onmessage = (event) => resolve(event.data);
    });
    connected.restore({ x: 0, y: 300 });
    expect(await restored).toEqual({
      ...binding,
      version: 1,
      type: "restore-scroll",
      x: 0,
      y: 300,
    });
    port.postMessage({ ...binding, version: 1, type: "scroll", x: 0, y: 300 });
    await expect
      .poll(() => scrolled, {
        timeout: 1_000,
        message: "Current document reports its scroll position",
      })
      .toEqual([{ x: 0, y: 300 }]);
    port.postMessage({ ...message, generation: 2 });
    port.postMessage({ ...message, type: "save" });
    port.postMessage(message);
    await expect
      .poll(() => selected, {
        timeout: 1_000,
        message: "Current document selects its nested Block",
      })
      .toEqual(["nested"]);
    const closed = new Promise<void>((resolve) => {
      port.addEventListener("close", () => resolve(), { once: true });
    });
    // Work queued before disposal must not reach the callbacks either.
    port.postMessage(message);
    port.postMessage({ ...binding, version: 1, type: "scroll", x: 0, y: 400 });
    connected.dispose();
    port.postMessage(message);
    port.postMessage({ ...binding, version: 1, type: "scroll", x: 0, y: 400 });
    await closed;
    expect(selected).toEqual(["nested"]);
    expect(scrolled).toEqual([{ x: 0, y: 300 }]);
  } finally {
    connected.dispose();
    port.close();
  }
});
