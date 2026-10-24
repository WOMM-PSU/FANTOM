import { describe, expect, it } from "vitest";
import { applyConfigPatch, defaultConfig } from "../src/validation/config.js";

const devAllowed = { allowDevMode: true };
const devBlocked = { allowDevMode: false };

describe("applyConfigPatch", () => {
  it("starts from a fresh default config", () => {
    const first = defaultConfig();
    first.durationSec = 60;
    expect(defaultConfig().durationSec).toBe(300);
  });

  it("applies a section-level patch", () => {
    const result = applyConfigPatch(
      defaultConfig(),
      { durationSec: 900, minimap: { enabled: true, showAllies: false, showEnemies: false, showPickups: false } },
      devBlocked,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.durationSec).toBe(900);
    expect(result.config.minimap.showPickups).toBe(false);
  });

  it("rejects out-of-range values", () => {
    const result = applyConfigPatch(defaultConfig(), { durationSec: 5 }, devBlocked);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("durationSec");
  });

  it("hides enemy positions outside FFA", () => {
    const result = applyConfigPatch(
      defaultConfig(),
      { mode: "assassin", minimap: { enabled: true, showAllies: true, showEnemies: true, showPickups: true } },
      devBlocked,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.minimap.showEnemies).toBe(false);
    expect(result.config.spawnLockoutSec).toBe(15);
  });

  it("turns off minimap layers when the minimap is disabled", () => {
    const result = applyConfigPatch(
      defaultConfig(),
      { minimap: { enabled: false, showAllies: true, showEnemies: true, showPickups: true } },
      devBlocked,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.minimap).toEqual({
      enabled: false,
      showAllies: false,
      showEnemies: false,
      showPickups: false,
    });
  });

  it("refuses devMode unless the server allows it", () => {
    const blocked = applyConfigPatch(defaultConfig(), { devMode: true }, devBlocked);
    expect(blocked.ok).toBe(false);

    const allowed = applyConfigPatch(defaultConfig(), { devMode: true }, devAllowed);
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.config.devMode).toBe(true);
  });
});
