// One outstanding request, with only the latest waiting candidate retained.
// An obsolete completion cannot update the iframe, including after disposal.
export function createPreviewQueue<T, R>(
  request: (candidate: T, signal: AbortSignal) => Promise<R>,
  receive: (result: R, candidate: T) => void,
  fail: (error: unknown) => void,
) {
  let version = 0;
  let latest: { candidate: T; version: number } | undefined;
  let active: AbortController | undefined;
  let disposed = false;
  async function drain() {
    if (active || !latest || disposed) return;
    const job = latest;
    latest = undefined;
    const controller = new AbortController();
    active = controller;
    try {
      const result = await request(job.candidate, controller.signal);
      if (!disposed && job.version === version) receive(result, job.candidate);
    } catch (error) {
      if (!disposed && job.version === version) fail(error);
    } finally {
      active = undefined;
      void drain();
    }
  }
  return {
    submit(candidate: T) {
      if (disposed) return;
      latest = { candidate, version: ++version };
      void drain();
    },
    dispose() {
      disposed = true;
      latest = undefined;
      version++;
      active?.abort();
    },
  };
}
