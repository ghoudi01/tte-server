import { describe, it, expect } from "vitest";
import { normalizeTunisiaMobile, e164TunisiaFromNational } from "./tunisia-phone";

describe("normalizeTunisiaMobile", () => {
  it("normalizes national format", () => {
    expect(normalizeTunisiaMobile("20 123 456")).toBe("20123456");
  });

  it("normalizes +216 format", () => {
    expect(normalizeTunisiaMobile("+216 20 123 456")).toBe("20123456");
  });

  it("returns null for invalid numbers", () => {
    expect(normalizeTunisiaMobile("12")).toBeNull();
  });

  it("returns null for non-mobile prefix", () => {
    expect(normalizeTunisiaMobile("30 123 456")).toBeNull();
  });
});

describe("e164TunisiaFromNational", () => {
  it("converts 8-digit national to E.164", () => {
    expect(e164TunisiaFromNational("20123456")).toBe("+21620123456");
  });
});
