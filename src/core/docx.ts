import { inflateRawSync } from "node:zlib";

/**
 * A .docx is a ZIP archive, and a candidate's CV is an untrusted file from the
 * internet. Rather than hand it to a general-purpose archive library, this
 * reader opens exactly one entry — `word/document.xml` — under explicit limits,
 * so a malicious archive cannot turn an upload into a denial of service.
 *
 * What it refuses, and why:
 *  - encrypted entries: nothing can be read, and a password prompt is not a
 *    thing a background parser can answer;
 *  - an expansion ratio or total size above the caps: the classic zip bomb;
 *  - absolute paths and `..` segments: nothing is ever written to disk here,
 *    but an archive that tries is not one to keep reading;
 *  - anything but stored or deflated data: other methods are not used by Word.
 */
export const DOCX_LIMITS = {
  /** `word/document.xml` of a very long CV is far below this. */
  maxEntryBytes: 32 * 1024 * 1024,
  /** Deflate rarely beats 200:1 on prose; a bomb needs thousands to one. */
  maxExpansionRatio: 200,
  maxEntries: 2000,
} as const;

export type DocxFailure =
  | "ARCHIVE_ENCRYPTED"
  | "ARCHIVE_UNSAFE"
  | "ARCHIVE_CORRUPT"
  | "NOT_A_DOCUMENT";

export class DocxError extends Error {
  // A plain field, not a parameter property: Node's type stripping runs this
  // file as written and does not support the shorthand.
  reason: DocxFailure;
  constructor(reason: DocxFailure) {
    super(reason);
    this.name = "DocxError";
    this.reason = reason;
  }
}

const DOCUMENT_ENTRY = "word/document.xml";
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** The end-of-central-directory record sits at the tail, after a comment of up to 64 KiB. */
function findEndOfCentralDirectory(bytes: Uint8Array) {
  const data = view(bytes);
  const earliest = Math.max(0, bytes.length - (22 + 0xffff));
  for (let at = bytes.length - 22; at >= earliest; at--)
    if (data.getUint32(at, true) === EOCD_SIGNATURE) return at;
  throw new DocxError("ARCHIVE_CORRUPT");
}

type Entry = {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  encrypted: boolean;
};

function readCentralDirectory(bytes: Uint8Array): Entry[] {
  const data = view(bytes);
  const eocd = findEndOfCentralDirectory(bytes);
  const count = data.getUint16(eocd + 10, true);
  let at = data.getUint32(eocd + 16, true);
  if (count > DOCX_LIMITS.maxEntries) throw new DocxError("ARCHIVE_UNSAFE");
  const entries: Entry[] = [];
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || data.getUint32(at, true) !== CENTRAL_SIGNATURE)
      throw new DocxError("ARCHIVE_CORRUPT");
    const flags = data.getUint16(at + 8, true);
    const nameLength = data.getUint16(at + 28, true);
    const extraLength = data.getUint16(at + 30, true);
    const commentLength = data.getUint16(at + 32, true);
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + nameLength),
    );
    entries.push({
      name,
      compression: data.getUint16(at + 10, true),
      compressedSize: data.getUint32(at + 20, true),
      uncompressedSize: data.getUint32(at + 24, true),
      localHeaderOffset: data.getUint32(at + 42, true),
      // General purpose bit 0 marks an entry as encrypted.
      encrypted: (flags & 1) === 1,
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function assertSafeName(name: string) {
  if (
    name.startsWith("/") ||
    /^[a-zA-Z]:/.test(name) ||
    name.split("/").includes("..")
  )
    throw new DocxError("ARCHIVE_UNSAFE");
}

function readEntry(bytes: Uint8Array, entry: Entry) {
  const data = view(bytes);
  const at = entry.localHeaderOffset;
  if (at + 30 > bytes.length || data.getUint32(at, true) !== LOCAL_SIGNATURE)
    throw new DocxError("ARCHIVE_CORRUPT");
  // The local header repeats the name and extra field with its own lengths.
  const start =
    at + 30 + data.getUint16(at + 26, true) + data.getUint16(at + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new DocxError("ARCHIVE_CORRUPT");
  const body = bytes.subarray(start, end);
  if (entry.compression === 0) {
    if (body.length > DOCX_LIMITS.maxEntryBytes)
      throw new DocxError("ARCHIVE_UNSAFE");
    return body;
  }
  if (entry.compression !== 8) throw new DocxError("ARCHIVE_UNSAFE");
  // Both caps are checked before inflating: the declared size is attacker
  // controlled, so it is a reason to refuse, never a reason to trust.
  if (
    entry.uncompressedSize > DOCX_LIMITS.maxEntryBytes ||
    (entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize >
        DOCX_LIMITS.maxExpansionRatio)
  )
    throw new DocxError("ARCHIVE_UNSAFE");
  let inflated: Buffer;
  try {
    inflated = inflateRawSync(body, { maxOutputLength: DOCX_LIMITS.maxEntryBytes });
  } catch {
    // zlib throws for both a bomb hitting maxOutputLength and a corrupt stream.
    throw new DocxError("ARCHIVE_CORRUPT");
  }
  return new Uint8Array(inflated);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X"))
      return String.fromCodePoint(parseInt(body.slice(2), 16) || 0xfffd);
    if (body.startsWith("#"))
      return String.fromCodePoint(parseInt(body.slice(1), 10) || 0xfffd);
    return ENTITIES[body] ?? whole;
  });
}

/**
 * Pulls the readable text out of WordprocessingML. Only `<w:t>` carries text;
 * paragraph, break and tab elements decide where the line ends. Everything
 * else — including any embedded field instruction or macro reference — is
 * dropped rather than interpreted.
 */
export function documentXmlToText(xml: string) {
  const out: string[] = [];
  let line = "";
  const token = /<(\/?)(w:[A-Za-z]+)([^>]*)>([^<]*)/g;
  let match: RegExpExecArray | null;
  let inText = false;
  while ((match = token.exec(xml))) {
    const [, closing, tag, , following] = match;
    if (tag === "w:t") inText = !closing;
    else if (!closing && (tag === "w:br" || tag === "w:cr")) {
      out.push(line);
      line = "";
    } else if (!closing && tag === "w:tab") line += "\t";
    else if (closing && tag === "w:p") {
      out.push(line);
      line = "";
    }
    if (inText && following) line += decodeEntities(following);
  }
  if (line) out.push(line);
  return out
    .join("\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The candidate's readable CV text, or a `DocxError` naming what went wrong. */
export function docxToText(bytes: Uint8Array) {
  const entries = readCentralDirectory(bytes);
  for (const entry of entries) assertSafeName(entry.name);
  if (entries.some((entry) => entry.encrypted))
    throw new DocxError("ARCHIVE_ENCRYPTED");
  const document = entries.find((entry) => entry.name === DOCUMENT_ENTRY);
  if (!document) throw new DocxError("NOT_A_DOCUMENT");
  const xml = new TextDecoder().decode(readEntry(bytes, document));
  return documentXmlToText(xml);
}
