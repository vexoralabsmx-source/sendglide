import { describe, expect, it } from "vitest";
import {
  generatePairingCode,
  isExpired,
  normalizePairingCode,
  randomId,
} from "./pairing";
describe("pairing", () => {
  it("creates non-sequential friendly codes", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generatePairingCode()),
    );
    expect(codes.size).toBe(50);
    expect([...codes][0]).toMatch(/^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/);
  });
  it("normalizes input and tracks expiry", () => {
    expect(normalizePairingCode(" ab-c 123 ")).toBe("ABC123");
    expect(isExpired(100, 100)).toBe(true);
    expect(isExpired(101, 100)).toBe(false);
  });
  it("generates random hex identifiers", () => {
    expect(randomId(8)).toMatch(/^[a-f0-9]{16}$/);
  });
});
