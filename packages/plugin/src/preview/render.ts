// One budget per host module instance. Call only after authorizing and validating
// the request. This limits outstanding work, not trusted Component CPU or memory.
let active = 0;

function failure(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 503 ? { "Retry-After": "1" } : {}),
      },
    },
  );
}

async function bufferResponse(input: string | Response) {
  const response = typeof input === "string" ? new Response(input) : input;
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size <= 4_000_000) chunks.push(value);
        else chunks.length = 0;
        // Drain after overflow: cancelling a stream does not prove that an
        // asynchronous trusted Component has stopped executing.
      }
    }
  } finally {
    reader?.releaseLock();
  }
  if (size > 4_000_000)
    return failure(413, "OUTPUT_LIMIT", "Preview is too large. Your changes are kept.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  if (typeof input === "string") headers.set("Content-Type", "text/html; charset=utf-8");
  headers.delete("Content-Length");
  return new Response(response.body === null ? null : bytes, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function renderPreview(render: () => Promise<string | Response>, signal: AbortSignal) {
  if (signal.aborted) return failure(499, "CANCELLED", "Preview request cancelled.");
  if (active >= 2)
    return failure(503, "BUSY", "Preview is busy. Retry shortly; your changes are kept.");
  active++;

  let timer: ReturnType<typeof setTimeout>;
  let onAbort: () => void;
  const interrupted = new Promise<Response>((resolve) => {
    timer = setTimeout(
      () =>
        resolve(failure(504, "TIMEOUT", "Preview took too long. Retry; your changes are kept.")),
      10_000,
    );
    onAbort = () => resolve(failure(499, "CANCELLED", "Preview request cancelled."));
    signal.addEventListener("abort", onAbort, { once: true });
  });

  const work = Promise.resolve()
    .then(render)
    .then(bufferResponse)
    .catch(() =>
      failure(500, "RENDER_FAILED", "Preview could not load. Retry; your changes are kept."),
    )
    .finally(() => {
      active--;
    });

  try {
    // Synchronous installed Component code blocks the timer too. Timeout/abort
    // ends the response only; capacity remains occupied until work settles.
    return await Promise.race([interrupted, work]);
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener("abort", onAbort!);
  }
}
