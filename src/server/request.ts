import "server-only";
import { assertSameOrigin } from "@/core/security";
import { resolveError } from "@/core/api-errors";
export function mutationGuard(req: Request) {
  assertSameOrigin(req, process.env.APP_BASE_URL ?? "http://localhost:3000");
}
export function errorResponse(error: unknown) {
  const { code, status, message, field } = resolveError(error);
  return Response.json(
    { error: message, code, ...(field ? { field } : {}) },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
export async function readJson(req: Request, max = 100_000) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("BODY_REQUIRED");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
