import { describe, expect, it } from "vitest";
import { detectContentKind, safeUrl, sanitizeFilename } from "./content";
describe("content detection", () => {
  it.each([
    ["https://sendglide.app", "url"],
    ["hello@example.com", "email"],
    ["+52 55 1234 5678", "phone"],
    ["const x = {\n a: 1\n};", "code"],
    ["hello", "text"],
  ])("detects %s", (value, kind) =>
    expect(detectContentKind(value)).toBe(kind),
  );
  it("only opens web URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://example.com")).toBe("https://example.com/");
  });
  it("sanitizes filenames", () =>
    expect(sanitizeFilename("../bad<script>.txt")).toBe(".._bad_script_.txt"));
});
