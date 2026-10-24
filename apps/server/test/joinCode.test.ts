import { describe, expect, it } from "vitest";
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  generateJoinCode,
  normalizeJoinCode,
} from "../src/lobby/joinCode.js";

describe("join codes", () => {
  it("uses five characters from the unambiguous alphabet", () => {
    const code = generateJoinCode(() => false);
    expect(code).toHaveLength(JOIN_CODE_LENGTH);
    for (const character of code) {
      expect(JOIN_CODE_ALPHABET).toContain(character);
    }
    expect(code).not.toMatch(/[0O1IL]/);
  });

  it("avoids taken codes", () => {
    const generated: string[] = [];
    for (let index = 0; index < 50; index += 1) {
      const code = generateJoinCode((candidate) => generated.includes(candidate));
      expect(generated).not.toContain(code);
      generated.push(code);
    }
    expect(new Set(generated).size).toBe(50);
  });

  it("normalizes input case and whitespace", () => {
    expect(normalizeJoinCode(" ab2cd ")).toBe("AB2CD");
  });
});
