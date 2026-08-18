import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";
describe("rate limit", () => {
  it("limits and resets a bucket", () => {
    expect(checkRateLimit("test", 2, 100, 0).allowed).toBe(true);
    expect(checkRateLimit("test", 2, 100, 1).allowed).toBe(true);
    expect(checkRateLimit("test", 2, 100, 2).allowed).toBe(false);
    expect(checkRateLimit("test", 2, 100, 101).allowed).toBe(true);
  });
});
