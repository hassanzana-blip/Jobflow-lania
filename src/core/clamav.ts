/**
 * The clamd INSTREAM wire format, kept separate from the socket so it can be
 * tested without a daemon.
 *
 * Scanning is optional: `CLAMAV_HOST` is unset in every environment so far. The
 * important half of that decision lives in the caller — an unscanned document
 * stays quarantined and is never handed back out through a signed URL — but the
 * protocol belongs here, ready for the day the daemon exists.
 */
export type ScanVerdict =
  | { state: "clean" }
  | { state: "infected"; signature: string }
  | { state: "unavailable"; detail: string };

/** clamd rejects a chunk larger than its StreamMaxLength; 64 KiB is always safe. */
export const CLAMAV_CHUNK_BYTES = 64 * 1024;

/**
 * INSTREAM is `zINSTREAM\0`, then length-prefixed chunks, then a zero length.
 * Returns the frames in order so the caller only has to write them.
 */
export function instreamFrames(bytes: Uint8Array, chunkSize = CLAMAV_CHUNK_BYTES) {
  const frames: Uint8Array[] = [new TextEncoder().encode("zINSTREAM\0")];
  for (let at = 0; at < bytes.length; at += chunkSize) {
    const chunk = bytes.subarray(at, Math.min(at + chunkSize, bytes.length));
    const frame = new Uint8Array(4 + chunk.length);
    new DataView(frame.buffer).setUint32(0, chunk.length, false);
    frame.set(chunk, 4);
    frames.push(frame);
  }
  frames.push(new Uint8Array([0, 0, 0, 0]));
  return frames;
}

/**
 * clamd answers `stream: OK`, `stream: <signature> FOUND`, or an error. Any
 * reply that is not a clear "OK" leaves the document quarantined: an
 * unparseable answer from a scanner is not permission to trust the file.
 */
export function readScanReply(reply: string): ScanVerdict {
  const line = reply.replace(/\0/g, "").trim();
  if (/\bOK$/.test(line) && !/FOUND$/.test(line)) return { state: "clean" };
  const found = /^stream:\s*(.+?)\s+FOUND$/.exec(line);
  if (found) return { state: "infected", signature: found[1] };
  return { state: "unavailable", detail: line || "empty reply" };
}
