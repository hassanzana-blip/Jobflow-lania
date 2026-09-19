import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, crc32 } from "node:zlib";
import { readFile } from "node:fs/promises";
import {
  docxToText,
  documentXmlToText,
  DocxError,
  DOCX_LIMITS,
} from "../src/core/docx.ts";
import {
  classifyParseError,
  isRetryable,
  normaliseText,
  readParserOutput,
  MAX_TEXT_CHARS,
} from "../src/core/document-parse.ts";
import { applicationPdf } from "../src/core/pdf.ts";

/**
 * Builds a real ZIP so the reader is exercised against bytes, not a mock. Each
 * option corresponds to something a hostile archive actually does.
 */
function zip(
  files: { name: string; body: Uint8Array; store?: boolean; encrypted?: boolean }[],
  options: { declaredSize?: number } = {},
) {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const body = file.store ? file.body : new Uint8Array(deflateRawSync(file.body));
    const crc = crc32(Buffer.from(file.body));
    const uncompressed = options.declaredSize ?? file.body.length;
    const flags = file.encrypted ? 1 : 0;
    const method = file.store ? 0 : 8;

    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, uncompressed, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, uncompressed, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return Buffer.concat([...locals, ...centrals, eocd].map(Buffer.from));
}

const wordDocument = (body: string) =>
  new TextEncoder().encode(
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`,
  );

const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

const docx = (body: string, extra: Parameters<typeof zip>[0] = []) =>
  new Uint8Array(
    zip([
      { name: "[Content_Types].xml", body: new TextEncoder().encode("<Types/>") },
      { name: "word/document.xml", body: wordDocument(body) },
      ...extra,
    ]),
  );

test("a Word CV yields its text, and only its text", () => {
  const text = docxToText(
    docx(
      paragraph("Åsa Östlund") +
        paragraph("Sex års erfarenhet av arbetsrätt &amp; lönefrågor") +
        `<w:p><w:r><w:t>Volvo</w:t></w:r><w:r><w:tab/><w:t>2019–2025</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Rad ett</w:t><w:br/><w:t>Rad två</w:t></w:r></w:p>`,
    ),
  );
  assert.equal(
    text,
    "Åsa Östlund\nSex års erfarenhet av arbetsrätt & lönefrågor\nVolvo\t2019–2025\nRad ett\nRad två",
  );
});

test("markup around the text is never interpreted as content", () => {
  // Field instructions, comments and styling carry no readable prose, and a
  // CV is untrusted input: anything that is not <w:t> is dropped.
  const text = documentXmlToText(
    `<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>HYPERLINK "https://evil.test"</w:instrText></w:r>` +
      `<w:r><w:rPr><w:b/></w:rPr><w:t>Riktig text</w:t></w:r></w:p>`,
  );
  assert.equal(text, "Riktig text");
  assert.equal(documentXmlToText("<w:p><w:r><w:t>&#197;sa &#xE4;r h&quot;r</w:t></w:r></w:p>"),
    'Åsa är h"r');
});

test("a hostile archive is refused with the reason, not parsed", () => {
  const reason = (bytes: Uint8Array) => {
    try {
      docxToText(bytes);
      return "no error";
    } catch (error) {
      return error instanceof DocxError ? error.reason : "wrong error type";
    }
  };

  // A password on the archive: nothing can be read from it.
  assert.equal(
    reason(
      new Uint8Array(
        zip([{ name: "word/document.xml", body: wordDocument(paragraph("x")), encrypted: true }]),
      ),
    ),
    "ARCHIVE_ENCRYPTED",
  );

  // A zip bomb declares an expansion far beyond what prose ever reaches.
  assert.equal(
    reason(
      new Uint8Array(
        zip([{ name: "word/document.xml", body: new Uint8Array(4096) }], {
          declaredSize: 4096 * DOCX_LIMITS.maxExpansionRatio * 10,
        }),
      ),
    ),
    "ARCHIVE_UNSAFE",
  );

  // Path traversal is not a thing a real .docx does.
  assert.equal(
    reason(
      new Uint8Array(
        zip([
          { name: "word/document.xml", body: wordDocument(paragraph("x")) },
          { name: "../../etc/passwd", body: new TextEncoder().encode("root") },
        ]),
      ),
    ),
    "ARCHIVE_UNSAFE",
  );

  // A PDF renamed to .docx, and a truncated upload.
  assert.equal(
    reason(new Uint8Array(zip([{ name: "other.xml", body: new TextEncoder().encode("<a/>") }]))),
    "NOT_A_DOCUMENT",
  );
  assert.equal(reason(new TextEncoder().encode("%PDF-1.7 not a zip")), "ARCHIVE_CORRUPT");
  const truncated = docx(paragraph("x"));
  assert.equal(reason(truncated.slice(0, truncated.length - 40)), "ARCHIVE_CORRUPT");
});

test("a bomb that lies about its size still cannot exhaust memory", () => {
  // Declared size within the cap, actual content far beyond it: the ratio check
  // passes, so zlib's own output limit has to be the one that refuses.
  const body = new Uint8Array(DOCX_LIMITS.maxEntryBytes + 1024);
  const bytes = new Uint8Array(
    zip([{ name: "word/document.xml", body }], { declaredSize: 1024 }),
  );
  assert.throws(() => docxToText(bytes), (error: unknown) =>
    error instanceof DocxError && error.reason === "ARCHIVE_CORRUPT");
});

test("extracted text is cleaned and capped before it goes anywhere", () => {
  const messy = normaliseText("  Åsa\u0000\u0007   Östlund \r\n\r\n\r\n  HR   \t ");
  assert.equal(messy.text, "Åsa Östlund\n\nHR");
  assert.equal(messy.truncated, false);
  const long = normaliseText("a".repeat(MAX_TEXT_CHARS + 500));
  assert.equal(long.text.length, MAX_TEXT_CHARS);
  assert.equal(long.truncated, true);
});

test("the parser's answer is read without being trusted", () => {
  assert.deepEqual(readParserOutput('{"ok":true,"text":"Hej  där","pages":2}'), {
    ok: true,
    text: "Hej där",
    pages: 2,
    truncated: false,
  });
  assert.deepEqual(readParserOutput('{"ok":false,"reason":"ENCRYPTED"}'), {
    ok: false,
    reason: "ENCRYPTED",
  });
  // A reason we do not recognise, a crash that printed nothing, and a shape
  // that claims success without text all become the same honest failure.
  assert.deepEqual(readParserOutput('{"ok":false,"reason":"rm -rf"}'), {
    ok: false,
    reason: "PARSER_FAILED",
  });
  assert.deepEqual(readParserOutput(""), { ok: false, reason: "PARSER_FAILED" });
  assert.deepEqual(readParserOutput('{"ok":true}'), { ok: false, reason: "PARSER_FAILED" });
  assert.equal(readParserOutput('{"ok":true,"text":"x","pages":"many"}').ok, true);

  assert.equal(classifyParseError(Object.assign(new Error("x"), { name: "PasswordException" })), "ENCRYPTED");
  assert.equal(classifyParseError(new DocxError("ARCHIVE_UNSAFE")), "UNSAFE_ARCHIVE");
  assert.equal(classifyParseError(new DocxError("ARCHIVE_ENCRYPTED")), "ENCRYPTED");
  assert.equal(classifyParseError(new Error("Invalid PDF structure")), "CORRUPT");
  assert.equal(classifyParseError(new Error("something else")), "PARSER_FAILED");
  assert.equal(isRetryable("TIMEOUT"), true);
  assert.equal(isRetryable("ENCRYPTED"), false);
});

test("a real Swedish PDF round-trips through the isolated parser", async () => {
  const { parseDocumentBytes } = await import("../src/server/document-parser.ts");
  const font = await readFile(new URL("../public/fonts/Inter-Regular.ttf", import.meta.url));
  const pdf = await applicationPdf({
    name: "Åsa Östlund",
    title: "HR-specialist",
    text: "Sex års erfarenhet av arbetsrätt och lönefrågor på Volvo i Göteborg.\nExamen i personalvetenskap 2018.",
    font: new Uint8Array(font),
  });
  const result = await parseDocumentBytes(pdf, "pdf");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.text, /Åsa Östlund/);
  assert.match(result.text, /arbetsrätt och lönefrågor/);
  assert.equal(result.pages, 1);
});

test("the isolated parser names each failure instead of hanging", async () => {
  const { parseDocumentBytes } = await import("../src/server/document-parser.ts");
  // A Word file with a text layer, through the real child process.
  const wordResult = await parseDocumentBytes(
    docx(paragraph("Åsa Östlund, HR-specialist med sex års erfarenhet av arbetsrätt")),
    "docx",
  );
  assert.equal(wordResult.ok, true);

  // A scan exported as a PDF has no selectable text at all.
  assert.deepEqual(await parseDocumentBytes(docx(paragraph("kort")), "docx"), {
    ok: false,
    reason: "NO_TEXT_LAYER",
  });
  // A truncated or mistyped upload.
  assert.deepEqual(
    await parseDocumentBytes(new TextEncoder().encode("%PDF-1.4 truncated"), "pdf"),
    { ok: false, reason: "CORRUPT" },
  );
  assert.deepEqual(await parseDocumentBytes(new Uint8Array(0), "pdf"), {
    ok: false,
    reason: "CORRUPT",
  });
});

const DOCUMENT_TEXT = `Åsa Östlund
HR-specialist, Göteborg

Volvo Group, HR Business Partner 2019–2025.
Sex års erfarenhet av arbetsrätt och lönefrågor.
Examen i personalvetenskap, Göteborgs universitet 2018.`;

const proposal = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  kind: "experience" as const,
  text: "Sex års erfarenhet av arbetsrätt",
  sourceQuote: "Sex års erfarenhet av arbetsrätt och lönefrågor.",
  ...over,
});

test("a proposed fact counts as evidence only if the document really says it", async () => {
  const { reviewFromExtraction } = await import("../src/core/extraction.ts");
  const review = reviewFromExtraction(
    {
      name: "Åsa Östlund",
      location: "Göteborg",
      facts: [
        proposal(),
        // Line breaks land wherever the page broke; folding must not care.
        proposal({ id: "f2", text: "Examen i personalvetenskap", sourceQuote: "Examen  i\npersonalvetenskap,   Göteborgs universitet 2018." }),
        // The model invented an employer the CV never mentions.
        proposal({ id: "f3", text: "Teamledare på Ericsson", sourceQuote: "Teamledare på Ericsson 2015–2019." }),
        // A quote too short to prove anything.
        proposal({ id: "f4", text: "HR", sourceQuote: "HR" }),
      ],
      unknowns: ["Lönenivå framgår inte"],
    },
    DOCUMENT_TEXT,
  );
  assert.deepEqual(
    review.facts.map((f) => [f.id, f.grounded, f.selected]),
    [
      ["f1", true, true],
      ["f2", true, true],
      ["f3", false, false],
      ["f4", false, false],
    ],
  );
  assert.equal(review.groundedCount, 2);
  assert.equal(review.ungroundedCount, 2);
  // An unverified quote must not be shown as if the document contained it.
  assert.equal(review.facts[2].sourceQuote, "");
  assert.equal(review.facts[0].sourceQuote, proposal().sourceQuote);
  assert.deepEqual(review.unknowns, ["Lönenivå framgår inte"]);
  // Nothing is confirmed by extraction alone.
  assert.equal(review.facts.every((f) => f.confirmed === false), true);
});

test("confirmation keeps the candidate's edits and re-earns the evidence", async () => {
  const { reviewFromExtraction, factsToConfirm } = await import("../src/core/extraction.ts");
  const review = reviewFromExtraction(
    {
      name: null,
      location: null,
      facts: [
        proposal(),
        proposal({ id: "f2", text: "Teamledare på Ericsson", sourceQuote: "Teamledare på Ericsson." }),
        proposal({ id: "f3", text: "Examen i personalvetenskap", sourceQuote: "Examen i personalvetenskap, Göteborgs universitet 2018." }),
      ],
      unknowns: [],
    },
    DOCUMENT_TEXT,
  );
  const confirmed = factsToConfirm(
    review,
    [
      { id: "f1", text: "Sex års erfarenhet av arbetsrätt", include: true },
      // The candidate corrects an invented fact into a true one. It is their
      // statement now, so it is kept — without a quote it never had.
      { id: "f2", text: "Teamledare på Volvo Group", include: true },
      { id: "f3", text: "Examen i personalvetenskap", include: false },
      { id: "does-not-exist", text: "Vd på Volvo", include: true },
    ],
    DOCUMENT_TEXT,
  );
  assert.deepEqual(
    confirmed.map((f) => [f.id, f.text, f.grounded, f.sourceQuote !== ""]),
    [
      ["f1", "Sex års erfarenhet av arbetsrätt", true, true],
      ["f2", "Teamledare på Volvo Group", false, false],
    ],
  );
  assert.equal(confirmed.every((f) => f.confirmed), true);
  // A fact the candidate did not include, and one the client made up, are gone.
  assert.equal(confirmed.some((f) => f.id === "f3" || f.id === "does-not-exist"), false);
});

test("an edit back to the original wording earns its quote again", async () => {
  const { reviewFromExtraction, factsToConfirm } = await import("../src/core/extraction.ts");
  const review = reviewFromExtraction(
    { name: null, location: null, facts: [proposal()], unknowns: [] },
    DOCUMENT_TEXT,
  );
  const [same] = factsToConfirm(
    review,
    [{ id: "f1", text: "  Sex års erfarenhet av arbetsrätt  ", include: true }],
    DOCUMENT_TEXT,
  );
  assert.equal(same.grounded, true);
  // The same review against a different document loses its grounding: the
  // quote is re-checked, never trusted from the earlier pass.
  const [moved] = factsToConfirm(
    review,
    [{ id: "f1", text: "Sex års erfarenhet av arbetsrätt", include: true }],
    "Ett helt annat dokument utan den meningen.",
  );
  assert.equal(moved.grounded, false);
  assert.equal(moved.sourceQuote, "");
});

test("stored names are derived, never taken from the upload", async () => {
  const { objectKeyFor, safeDisplayName } = await import("../src/core/security.ts");
  const user = "11111111-1111-4111-8111-111111111111";
  const key = objectKeyFor(user, "pdf");
  assert.match(key, new RegExp(`^${user}/[0-9a-f-]{36}\\.pdf$`));
  // Two uploads never collide, so one can never overwrite the other.
  assert.notEqual(objectKeyFor(user, "pdf"), key);

  // A filename is display text; a path, a control character or an endless
  // name must not travel into the bucket key or the database.
  assert.equal(safeDisplayName("../../etc/passwd"), "passwd");
  assert.equal(safeDisplayName("C:\\Users\\Åsa\\cv.pdf"), "cv.pdf");
  assert.equal(safeDisplayName("cv\u0000\u001b.pdf"), "cv.pdf");
  assert.equal(safeDisplayName("/"), "cv");
  assert.equal(safeDisplayName("x".repeat(400)).length, 150);
});

test("the malware scanner's wire format and its verdicts", async () => {
  const { instreamFrames, readScanReply } = await import("../src/core/clamav.ts");
  const frames = instreamFrames(new Uint8Array([1, 2, 3, 4, 5]), 2);
  assert.equal(new TextDecoder().decode(frames[0]), "zINSTREAM\u0000");
  // Three chunks of 2, 2 and 1 byte, each length-prefixed big endian, then the
  // zero-length terminator.
  assert.deepEqual(
    frames.slice(1).map((f) => [...f]),
    [
      [0, 0, 0, 2, 1, 2],
      [0, 0, 0, 2, 3, 4],
      [0, 0, 0, 1, 5],
      [0, 0, 0, 0],
    ],
  );

  assert.deepEqual(readScanReply("stream: OK\u0000"), { state: "clean" });
  assert.deepEqual(readScanReply("stream: Eicar-Test-Signature FOUND\u0000"), {
    state: "infected",
    signature: "Eicar-Test-Signature",
  });
  // Anything that is not a clear OK leaves the document quarantined. A reply
  // that merely mentions OK inside a signature name must not read as clean.
  assert.equal(readScanReply("").state, "unavailable");
  assert.equal(readScanReply("ERROR: size limit exceeded").state, "unavailable");
  assert.equal(readScanReply("stream: Win.Trojan.OK FOUND").state, "infected");
});
