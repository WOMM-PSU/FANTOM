import { z } from "zod";

export const StoredSessionSchema = z.object({
  matchId: z.string().min(1),
  joinCode: z.string().min(4).max(8),
  joinUrl: z.string().url(),
  playerId: z.string().min(1),
  sessionToken: z.string().min(16).max(128),
  displayName: z.string().min(1).max(20),
});

export type StoredSession = z.infer<typeof StoredSessionSchema>;

const SESSION_STORAGE_KEY = "fantom.session.v1";

/**
 * Unambiguous 5-character join code alphabet (no 0/O/1/I/L per PLAN.md P4.2).
 */
export const JOIN_CODE_REGEX = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;

export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

export function isValidJoinCode(code: string): boolean {
  return JOIN_CODE_REGEX.test(code);
}

export function saveSession(session: StoredSession): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function loadSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = StoredSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}
