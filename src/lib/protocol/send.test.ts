import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, PROTOCOL_VERSION, parseSendMessage } from "./send";
describe("SEND/1 validation", () => {
  it("accepts valid transfer metadata", () => {
    expect(
      parseSendMessage({
        protocol: PROTOCOL_VERSION,
        type: "transfer-offer",
        file: {
          transferId: "12345678",
          name: "notes.txt",
          mimeType: "text/plain",
          size: 2,
          chunkSize: CHUNK_SIZE,
          totalChunks: 1,
          sendOnce: false,
        },
      })?.type,
    ).toBe("transfer-offer");
  });
  it("rejects unsafe or unknown messages", () => {
    expect(
      parseSendMessage({
        protocol: PROTOCOL_VERSION,
        type: "execute",
        html: "<script />",
      }),
    ).toBeNull();
    expect(
      parseSendMessage({
        protocol: PROTOCOL_VERSION,
        type: "text",
        transferId: "short",
        text: "x",
        kind: "text",
      }),
    ).toBeNull();
  });
});
