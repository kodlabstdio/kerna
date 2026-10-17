export interface PreviewBinding {
  token: string;
  session: string;
  generation: number;
}

export type PreviewScroll = { x: number; y: number };

export function scrollMessage(value: unknown, binding: PreviewBinding): PreviewScroll | undefined {
  if (typeof value !== "object" || value === null) return;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join() !== "generation,session,token,type,version,x,y" ||
    data.type !== "scroll" ||
    data.version !== 1 ||
    data.token !== binding.token ||
    data.session !== binding.session ||
    data.generation !== binding.generation ||
    typeof data.x !== "number" ||
    typeof data.y !== "number" ||
    !Number.isFinite(data.x) ||
    !Number.isFinite(data.y) ||
    data.x < 0 ||
    data.y < 0 ||
    data.x > 10_000_000 ||
    data.y > 10_000_000
  )
    return;
  return { x: data.x, y: data.y };
}

export function selectionMessage(
  value: unknown,
  binding: PreviewBinding,
  ids: ReadonlySet<string>,
): string | undefined {
  if (typeof value !== "object" || value === null) return;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join() !== "generation,id,session,token,type,version") return;
  if (
    data.version !== 1 ||
    data.type !== "select" ||
    data.token !== binding.token ||
    data.session !== binding.session ||
    data.generation !== binding.generation ||
    typeof data.id !== "string" ||
    !ids.has(data.id)
  )
    return;
  return data.id;
}

export function connectPreview(
  frame: HTMLIFrameElement,
  binding: PreviewBinding,
  ids: ReadonlySet<string>,
  select: (id: string) => void,
  scroll: (position: PreviewScroll) => void = () => {},
) {
  const channel = new MessageChannel();
  let disposed = false;
  channel.port1.onmessage = (event) => {
    const id = selectionMessage(event.data, binding, ids);
    if (!disposed && id) select(id);
    const position = scrollMessage(event.data, binding);
    if (!disposed && position) scroll(position);
  };
  // Only this opaque-origin iframe receives the port. No parent window-message
  // listener accepts messages, and callers bootstrap only once per document.
  frame.contentWindow?.postMessage({ ...binding, version: 1, type: "connect" }, "*", [
    channel.port2,
  ]);
  return {
    restore(position: PreviewScroll) {
      if (!disposed)
        channel.port1.postMessage({ ...binding, version: 1, type: "restore-scroll", ...position });
    },
    highlight(id: string | undefined) {
      if (!disposed)
        channel.port1.postMessage({
          ...binding,
          version: 1,
          type: "highlight",
          id: id && ids.has(id) ? id : null,
        });
    },
    dispose() {
      disposed = true;
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
    },
  };
}

// Serialized only by the host-compiled document. It has no module dependencies,
// and the per-response nonce authorizes this script alone.
export function frameBridge(binding: PreviewBinding) {
  let port: MessagePort | undefined;
  const matches = (data: Record<string, unknown>) =>
    data &&
    typeof data === "object" &&
    data.version === 1 &&
    data.token === binding.token &&
    data.session === binding.session &&
    data.generation === binding.generation;
  function connect(event: MessageEvent) {
    if (
      event.source !== parent ||
      !matches(event.data) ||
      event.data.type !== "connect" ||
      event.ports.length !== 1 ||
      port
    )
      return;
    port = event.ports[0];
    window.removeEventListener("message", connect);
    port!.onmessage = ({ data }) => {
      if (!matches(data)) return;
      if (
        data.type === "restore-scroll" &&
        Object.keys(data).sort().join() === "generation,session,token,type,version,x,y" &&
        Number.isFinite(data.x) &&
        Number.isFinite(data.y) &&
        data.x >= 0 &&
        data.y >= 0 &&
        data.x <= 10_000_000 &&
        data.y <= 10_000_000
      ) {
        window.scrollTo({ left: data.x, top: data.y, behavior: "instant" });
        return;
      }
      if (
        data.type !== "highlight" ||
        Object.keys(data).sort().join() !== "generation,id,session,token,type,version" ||
        (typeof data.id !== "string" && data.id !== null)
      )
        return;
      for (const element of document.querySelectorAll<HTMLElement>("[data-kerna-id]")) {
        element.style.outline = element.dataset.kernaId === data.id ? "2px solid Highlight" : "";
        element.style.outlineOffset = "2px";
      }
    };
  }
  window.addEventListener("message", connect);
  let scrollFrame = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (!port || scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        port?.postMessage({
          ...binding,
          version: 1,
          type: "scroll",
          x: Math.max(0, scrollX),
          y: Math.max(0, scrollY),
        });
      });
    },
    { passive: true },
  );
  document.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      const block = (event.target as Element)?.closest<HTMLElement>("[data-kerna-id]");
      if (block && port)
        port.postMessage({ ...binding, version: 1, type: "select", id: block.dataset.kernaId });
    },
    true,
  );
  document.addEventListener("submit", (event) => event.preventDefault(), true);
  window.addEventListener(
    "pagehide",
    () => {
      cancelAnimationFrame(scrollFrame);
      port?.close();
    },
    { once: true },
  );
}
