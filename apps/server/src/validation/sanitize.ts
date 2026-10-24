/** Display names come from untrusted clients and are rendered by other phones (PLAN S14). */

const INVISIBLE_AND_CONTROL =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

const MAX_DISPLAY_NAME_LENGTH = 20;

/** Keeps at most `max` UTF-16 code units without splitting a surrogate pair. */
function truncateCodeUnits(value: string, max: number): string {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > max) break;
    result += character;
  }
  return result;
}

/**
 * Normalizes a raw display name: removes control/invisible/bidi characters and
 * angle brackets, collapses whitespace, trims, and caps at 20 code units.
 * Returns null when nothing usable is left.
 */
export function sanitizeDisplayName(raw: string): string | null {
  const cleaned = raw
    .normalize("NFKC")
    .replace(INVISIBLE_AND_CONTROL, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const truncated = truncateCodeUnits(cleaned, MAX_DISPLAY_NAME_LENGTH).trim();
  return truncated.length > 0 ? truncated : null;
}
