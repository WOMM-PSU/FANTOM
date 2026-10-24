import {
  DEFAULT_MATCH_CONFIG,
  MatchConfig as MatchConfigSchema,
  SPAWN_LOCKOUT_SEC,
  type MatchConfig,
  type MatchConfigPatch,
} from "@fantom/shared";

export type ConfigResult = { ok: true; config: MatchConfig } | { ok: false; message: string };

/** Fresh, mutable default config. */
export function defaultConfig(): MatchConfig {
  return structuredClone(DEFAULT_MATCH_CONFIG) as MatchConfig;
}

/**
 * Applies a section-level patch and validates the result. The server never
 * trusts client settings (PLAN S5.2): mode-dependent visibility is clamped and
 * devMode is refused unless the server was started with ALLOW_DEV_MODE=true.
 */
export function applyConfigPatch(
  current: MatchConfig,
  patch: MatchConfigPatch,
  options: { allowDevMode: boolean },
): ConfigResult {
  const next = structuredClone(current) as MatchConfig;

  for (const key of Object.keys(patch) as (keyof MatchConfigPatch)[]) {
    const value = patch[key];
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = structuredClone(value);
    }
  }

  if (patch.mode !== undefined && patch.mode !== current.mode && patch.spawnLockoutSec === undefined) {
    next.spawnLockoutSec = SPAWN_LOCKOUT_SEC[patch.mode];
  }

  // A disabled minimap has no layers.
  if (!next.minimap.enabled) {
    next.minimap.showAllies = false;
    next.minimap.showEnemies = false;
    next.minimap.showPickups = false;
  }

  // Enemy positions stay hidden outside FFA regardless of what the host asks for (PLAN P4.5).
  if (next.mode !== "ffa") {
    next.minimap.showEnemies = false;
  }

  if (!options.allowDevMode) {
    if (patch.devMode === true) {
      return {
        ok: false,
        message: "devMode is disabled on this server (set ALLOW_DEV_MODE=true for local development)",
      };
    }
    next.devMode = false;
  }

  const parsed = MatchConfigSchema.safeParse(next);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, message };
  }

  return { ok: true, config: parsed.data };
}
