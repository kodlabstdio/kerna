import { expect, test, vi } from "vite-plus/test";
import { createPreviewQueue } from "../src/admin/preview-queue.ts";

test("a burst retains one active request and the latest candidate only", async () => {
  const pending: { value: number; resolve: (value: string) => void }[] = [];
  const receive = vi.fn();
  const fail = vi.fn();
  const queue = createPreviewQueue<number, string>(
    (value) =>
      new Promise((resolve) => {
        pending.push({ value, resolve });
      }),
    receive,
    fail,
  );
  queue.submit(1);
  for (let value = 2; value <= 100; value++) queue.submit(value);
  expect(pending.map((job) => job.value)).toEqual([1]);
  pending[0]!.resolve("stale");
  await Promise.resolve();
  expect(receive).not.toHaveBeenCalled();
  expect(pending.map((job) => job.value)).toEqual([1, 100]);
  pending[1]!.resolve("latest");
  await Promise.resolve();
  expect(receive).toHaveBeenCalledExactlyOnceWith("latest", 100);
  expect(fail).not.toHaveBeenCalled();
  queue.dispose();
});

test("disposal aborts and isolates late completion from the next session", async () => {
  let finish!: (value: string) => void;
  let signal!: AbortSignal;
  const receive = vi.fn();
  const queue = createPreviewQueue<string, string>(
    (_value, current) => {
      signal = current;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    receive,
    vi.fn(),
  );
  queue.submit("Page A");
  queue.submit("queued A");
  queue.dispose();
  expect(signal.aborted).toBe(true);
  finish("late A");
  await Promise.resolve();
  expect(receive).not.toHaveBeenCalled();
  queue.submit("disposed");
  const next = createPreviewQueue(async (value: string) => value, receive, vi.fn());
  next.submit("Page B");
  await Promise.resolve();
  expect(receive).toHaveBeenCalledExactlyOnceWith("Page B", "Page B");
  next.dispose();
});

test("a current failure is visible and retry can recover", async () => {
  const receive = vi.fn();
  const fail = vi.fn();
  const request = vi.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValueOnce("ok");
  const queue = createPreviewQueue(request, receive, fail);
  queue.submit("candidate");
  await Promise.resolve();
  expect(fail).toHaveBeenCalledOnce();
  queue.submit("retry");
  await Promise.resolve();
  expect(receive).toHaveBeenCalledExactlyOnceWith("ok", "retry");
  queue.dispose();
});
