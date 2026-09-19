/**
 * Reads one untrusted CV on stdin and writes `ParseResult` JSON to stdout.
 *
 * This runs as its own process on purpose. Parsing a document from the internet
 * is the largest attack surface in the product, so it happens somewhere that
 * has no database handle, no service-role key and no network: the parent spawns
 * it with a scrubbed environment, a heap cap and a wall-clock kill. A parser
 * that hangs, allocates without bound or crashes takes nothing with it, and the
 * candidate gets a named failure instead of a stuck upload.
 *
 * Usage: `node scripts/parse-document.mjs pdf|docx < file`
 */
import { classifyParseError, MIN_TEXT_CHARS } from "../src/core/document-parse.ts";
import { docxToText } from "../src/core/docx.ts";

// pdfjs reports recoverable problems through console.*, and stdout carries the
// single JSON result the parent parses. Send every console write to stderr so a
// warning about a damaged file cannot corrupt the protocol.
for (const level of ["log", "info", "warn", "error", "debug"])
  console[level] = (...parts) =>
    process.stderr.write(parts.map(String).join(" ") + "\n");

function respond(value) {
  process.stdout.write(JSON.stringify(value));
  process.exit(0);
}

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    // The route enforces the real limit; this is the backstop for a parent
    // that streams more than it promised.
    if (size > 12 * 1024 * 1024) respond({ ok: false, reason: "UNSAFE_ARCHIVE" });
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function pdfToText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes,
    // No eval, no remote fetches, no system font access: extraction only.
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: false,
  });
  const document = await task.promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    let line = "";
    const lines = [];
    for (const item of content.items) {
      if (typeof item.str !== "string") continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
    page.cleanup();
  }
  const text = pages.join("\n\n");
  // Read the count before tearing down: the proxy is unusable afterwards, and
  // the loading task — not the document — owns the worker to shut down.
  const pageCount = document.numPages;
  await task.destroy();
  return { text, pages: pageCount };
}

const kind = process.argv[2];
try {
  const bytes = await readStdin();
  if (!bytes.length) respond({ ok: false, reason: "CORRUPT" });
  if (kind === "docx") {
    const text = docxToText(bytes);
    // Word always keeps a text layer, so an empty one means the file holds no
    // readable prose — an image-only document, not a CV we can extract from.
    respond(
      text.trim().length < MIN_TEXT_CHARS
        ? { ok: false, reason: "NO_TEXT_LAYER" }
        : { ok: true, text, pages: null },
    );
  }
  if (kind === "pdf") {
    const { text, pages } = await pdfToText(bytes);
    respond(
      text.replace(/\s/g, "").length < MIN_TEXT_CHARS
        ? { ok: false, reason: "NO_TEXT_LAYER" }
        : { ok: true, text, pages },
    );
  }
  respond({ ok: false, reason: "PARSER_FAILED" });
} catch (error) {
  respond({ ok: false, reason: classifyParseError(error) });
}
