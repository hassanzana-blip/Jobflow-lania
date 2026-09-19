import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readParserOutput,
  type ParseResult,
} from "../core/document-parse.ts";

/**
 * Runs `scripts/parse-document.mjs` as a separate process and returns its
 * answer.
 *
 * The isolation is the point. A CV is a file a stranger chose, and document
 * parsers are where such files historically turn into remote code execution or
 * a pinned CPU. The child therefore gets:
 *
 *  - no environment: it is spawned with an env built from scratch, so the
 *    service-role key, the database URL and the model key are not reachable
 *    even if the parser is fully compromised;
 *  - a heap cap, so an allocation attack dies in the child, not in the server;
 *  - a wall-clock kill, so a parser that never returns cannot hold a request;
 *  - a bounded stdout, so it cannot flood the parent either.
 *
 * Nothing about the child's answer is trusted: it is JSON, validated by
 * `readParserOutput`, and any other outcome is a named failure.
 */
const SCRIPT = fileURLToPath(new URL("../../scripts/parse-document.mjs", import.meta.url));

export const PARSER_LIMITS = {
  timeoutMs: 20_000,
  heapMb: 256,
  /** Generous next to the 80k character cap, and far below anything harmful. */
  maxStdoutBytes: 2 * 1024 * 1024,
} as const;

export function parseDocumentBytes(
  bytes: Uint8Array,
  kind: "pdf" | "docx",
): Promise<ParseResult> {
  return new Promise((resolve) => {
    // Typed explicitly so the overload resolves: stdio stays at its default of
    // three pipes, which is what this needs and types the streams as present.
    //
    // env is built from scratch rather than inherited, so the service-role key,
    // the database URL and the model key are not reachable from the parser even
    // if it is fully compromised. PATH alone keeps Node's startup happy.
    const options: SpawnOptionsWithoutStdio = {
      // Cast because Next augments ProcessEnv to require NODE_ENV; the whole
      // point here is to hand the child less than a full environment.
      env: { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv,
    };
    const child = spawn(
      process.execPath,
      [`--max-old-space-size=${PARSER_LIMITS.heapMb}`, SCRIPT, kind],
      options,
    );

    let stdout = "";
    let settled = false;
    const finish = (result: ParseResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, reason: "TIMEOUT" }),
      PARSER_LIMITS.timeoutMs,
    );

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > PARSER_LIMITS.maxStdoutBytes)
        finish({ ok: false, reason: "PARSER_FAILED" });
    });
    // Warnings about damaged files are expected and belong nowhere near the
    // response; draining stderr keeps the child from blocking on a full pipe.
    child.stderr.resume();
    child.on("error", () => finish({ ok: false, reason: "PARSER_FAILED" }));
    child.on("close", (code: number | null) =>
      finish(code === 0 ? readParserOutput(stdout) : { ok: false, reason: "PARSER_FAILED" }),
    );

    child.stdin.on("error", () => finish({ ok: false, reason: "PARSER_FAILED" }));
    child.stdin.end(Buffer.from(bytes));
  });
}
