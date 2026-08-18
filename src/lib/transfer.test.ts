import { describe, expect, it } from "vitest";
import { assembleChunks, formatBytes, sha256 } from "./transfer";
describe("transfer helpers", () => {
  it("assembles ordered chunks", async () => {
    const blob = assembleChunks(
      [
        new TextEncoder().encode("send").buffer,
        new TextEncoder().encode("glide").buffer,
      ],
      "text/plain",
    );
    expect(await blob.text()).toBe("sendglide");
  });
  it("hashes content and formats sizes", async () => {
    expect(await sha256(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(formatBytes(1024)).toBe("1.0 KB");
  });
});
