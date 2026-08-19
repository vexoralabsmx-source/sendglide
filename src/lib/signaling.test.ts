import { describe, expect, it } from "vitest";
import { isValidSignalingConfig } from "@/lib/signaling";

describe("signaling configuration", () => {
  it("accepts a valid URL and non-placeholder key", () => {
    expect(
      isValidSignalingConfig(
        "https://project.supabase.co",
        "a-valid-anonymous-key-with-enough-length",
      ),
    ).toBe(true);
  });

  it("rejects missing and placeholder production values", () => {
    expect(isValidSignalingConfig(undefined, undefined)).toBe(false);
    expect(isValidSignalingConfig("placeholder", "placeholder")).toBe(false);
    expect(isValidSignalingConfig("Sensitive", "Sensitive")).toBe(false);
  });
});
