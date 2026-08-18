import { CHUNK_SIZE, type FileMetadata } from "@/lib/protocol/send";
import { randomId } from "@/lib/pairing";
import { sanitizeFilename } from "@/lib/content";

export function createFileMetadata(file: File, sendOnce = false): FileMetadata {
  return {
    transferId: randomId(),
    name: sanitizeFilename(file.name),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    chunkSize: CHUNK_SIZE,
    totalChunks: Math.ceil(file.size / CHUNK_SIZE),
    sendOnce,
  };
}

export function assembleChunks(chunks: ArrayBuffer[], mimeType: string): Blob {
  return new Blob(chunks, { type: mimeType });
}

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
