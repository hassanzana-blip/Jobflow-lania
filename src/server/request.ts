import "server-only";
import { assertSameOrigin } from "@/core/security";
export function mutationGuard(req: Request) {
  assertSameOrigin(req, process.env.APP_BASE_URL ?? "http://localhost:3000");
}
export function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const status =
    code === "RATE_LIMITED"
      ? 429
      : code === "VERSION_CONFLICT"
        ? 409
        : code === "NOT_FOUND"
          ? 404
          : code === "SOURCES_UNAVAILABLE"
            ? 502
            : code === "UNAUTHENTICATED"
              ? 401
              : code === "INVALID_ORIGIN"
                ? 403
                : code.includes("NOT_CONFIGURED")
                  ? 503
                  : 400;
  return Response.json(
    {
      error:
        status === 503
          ? "Tjänsten är inte ansluten ännu."
          : status === 429
            ? "Vänta en stund och försök igen."
            : status === 409
              ? "Uppgifterna har ändrats. Ladda om sidan innan du sparar."
              : status === 502
                ? "Jobbkällorna svarar inte just nu. Dina sparade jobb finns kvar."
                : status === 401
                  ? "Logga in för att fortsätta."
                  : "Det gick inte att slutföra åtgärden.",
    },
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
