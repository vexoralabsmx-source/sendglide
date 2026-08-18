import { describe, expect, it } from "vitest";
import { copy, detectLocale } from "@/lib/i18n";

describe("i18n", () => {
  it("keeps both languages structurally aligned", () => {
    expect(Object.keys(copy.es)).toEqual(Object.keys(copy.en));
    expect(Object.keys(copy.es.status)).toEqual(Object.keys(copy.en.status));
    expect(Object.keys(copy.es.modal)).toEqual(Object.keys(copy.en.modal));
    expect(Object.keys(copy.es.notice)).toEqual(Object.keys(copy.en.notice));
  });

  it("detects Spanish and falls back to English", () => {
    expect(detectLocale("es-MX")).toBe("es");
    expect(detectLocale("en-US")).toBe("en");
    expect(detectLocale(undefined)).toBe("en");
  });
});
