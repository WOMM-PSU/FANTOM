/** 31 unambiguous characters: no 0/O/1/I/L (PLAN P4.2). */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 5;

/** A match code is for discovery only — never authorization (PLAN S5.1). */
export function generateJoinCode(
  isTaken: (code: string) => boolean,
  rng: () => number = Math.random,
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = "";
    for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
      const index = Math.floor(rng() * JOIN_CODE_ALPHABET.length);
      code += JOIN_CODE_ALPHABET.charAt(index);
    }
    if (!isTaken(code)) return code;
  }
  throw new Error("unable to allocate a unique join code");
}

/** Input is case-insensitive (PLAN P4.2). */
export function normalizeJoinCode(input: string): string {
  return input.trim().toUpperCase();
}
