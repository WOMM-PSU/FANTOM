import { describe, expect, it } from "vitest";
import { sanitizeDisplayName } from "../src/validation/sanitize.js";

describe("sanitizeDisplayName", () => {
  it("normalizes whitespace", () => {
    expect(sanitizeDisplayName("  Ada \t  Lovelace  ")).toBe("Ada Lovelace");
  });

  it("strips control, bidi and zero-width characters", () => {
    expect(sanitizeDisplayName("A\u0000d\u202Ea\u200B")).toBe("Ada");
  });

  it("strips angle brackets", () => {
    expect(sanitizeDisplayName("<script>")).toBe("script");
  });

  it("truncates to 20 code units without splitting an emoji", () => {
    const result = sanitizeDisplayName("😀".repeat(11));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(20);
    expect(result).toMatch(/^[\u{1F600}]+$/u);
  });

  it("rejects names made only of invisible characters", () => {
    expect(sanitizeDisplayName(" \u200B\u202E ")).toBeNull();
    expect(sanitizeDisplayName("   ")).toBeNull();
  });
});
