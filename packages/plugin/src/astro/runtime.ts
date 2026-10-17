import { hasPermission, type RoleLevel } from "@emdash-cms/auth";
import {
  getEnabledComponents,
  readPage,
  type ComponentRegistry,
  type DesignSystem,
} from "@kodlab/kerna-core";
import { renderPreview } from "../preview/render.ts";
import type { PreviewBinding } from "../admin/preview-channel.ts";

type Configuration = { components: ComponentRegistry; designSystem: DesignSystem };
type PreviewContext = {
  request: Request;
  url: URL;
  locals: {
    user?: { role: RoleLevel };
    emdash?: {
      handleContentGet: (
        collection: string,
        id: string,
        query?: unknown,
        options?: unknown,
      ) => Promise<{ success: boolean }>;
    };
    kernaPreview?: { page: unknown; binding: PreviewBinding; nonce: string };
  };
};

const reject = (status: number) =>
  Response.json(
    { error: "Preview request rejected" },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );

/** Request admission is deliberately completed before the host Document runs. */
export async function admitPreview(
  context: PreviewContext,
  next: () => Promise<Response>,
  configuration: Configuration,
): Promise<Response> {
  const { request, url, locals } = context;
  if (url.pathname !== "/_emdash/api/kerna-preview") return next();
  if (request.method !== "POST") return reject(405);
  if (!hasPermission(locals.user, "schema:read")) return reject(403);
  const origin = request.headers.get("Origin");
  if (request.headers.get("X-EmDash-Request") !== "1" || (origin && origin !== url.origin))
    return reject(403);
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json") return reject(415);
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > 1_004_096) return reject(413);
  const reader = request.body?.getReader();
  if (!reader) return reject(400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1_004_096) {
        await reader.cancel();
        return reject(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return reject(400);
  }
  if (!body || typeof body !== "object") return reject(400);
  const value = body as Record<string, unknown>;
  const binding = value.binding as Record<string, unknown> | undefined;
  if (
    Object.keys(value).sort().join() !== "binding,id,page" ||
    typeof value.id !== "string" ||
    !value.id ||
    value.id.length > 128 ||
    !binding ||
    Object.keys(binding).sort().join() !== "generation,session,token" ||
    typeof binding.token !== "string" ||
    !/^[a-f0-9]{64}$/.test(binding.token) ||
    typeof binding.session !== "string" ||
    !/^[a-zA-Z0-9-]{1,128}$/.test(binding.session) ||
    !Number.isSafeInteger(binding.generation) ||
    (binding.generation as number) < 1
  )
    return reject(400);
  if (!locals.emdash) return reject(403);
  const existing = await locals.emdash.handleContentGet("kerna_pages", value.id, undefined, {
    includeDrafts: true,
  });
  if (!existing.success) return reject(404);
  const enabled = getEnabledComponents(configuration.components, configuration.designSystem);
  const checked = readPage(value.page, enabled, configuration.designSystem.tokens);
  if (!checked.ok) return reject(422);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  locals.kernaPreview = {
    page: checked.page,
    binding: binding as unknown as PreviewBinding,
    nonce,
  };
  const response = await renderPreview(next, request.signal);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
