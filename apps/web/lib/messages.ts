import type { ErrorCode, PlayerRole, RejectReason } from "@fantom/shared";

export type AimUnavailableReason =
  | "camera_denied"
  | "no_camera"
  | "orientation_denied"
  | "orientation_unsupported"
  | "insecure_context"
  | "sensors_stale"
  | "unsupported_browser";

/**
 * Exhaustive human-readable descriptions for every server RejectReason (PLAN.md Appendix 1).
 */
export const REJECT_REASON_MESSAGES: Record<RejectReason, string> = {
  WRONG_PHASE: "Action not allowed in the current match phase.",
  NOT_CONNECTED: "You are not connected to the match server.",
  SHOOTER_ELIMINATED: "You have been eliminated and cannot act.",
  SHOOTER_OUT_OF_ZONE: "You are outside the arena boundary! Return inside to act.",
  SPAWN_LOCKED: "Spawn protection is still active.",
  ROLE_CANNOT_ACT: "Your assigned role cannot perform this action.",
  NO_WEAPON: "You do not have a weapon equipped. Find a weapon pickup!",
  RELOADING: "Weapon is automatically reloading.",
  COOLDOWN: "Weapon firing interval cooldown in progress.",
  NO_AMMO: "Magazine empty — reloading.",
  INVALID_TARGET: "No valid player matches that target marker.",
  TARGET_ELIMINATED: "Target player is already eliminated.",
  TARGET_OUT_OF_ZONE: "Target is outside the arena and cannot be damaged.",
  TARGET_PROTECTED: "Target is currently under spawn protection.",
  FRIENDLY_TARGET: "Friendly fire is not allowed — that player is on your team.",
  LOCATION_UNAVAILABLE: "Your GPS location is unavailable.",
  LOCATION_TOO_POOR: "GPS accuracy is too poor to validate range.",
  EVIDENCE_STALE: "Camera/sensor aiming data was too old.",
  EVIDENCE_LOW_CONFIDENCE: "Target marker was not detected clearly enough.",
  EVIDENCE_AMBIGUOUS: "Multiple markers near reticle — aim clearly at one target.",
  TARGET_OCCLUDED: "Target marker appears partially blocked or occluded.",
  AIM_DISAGREEMENT: "Camera aim and compass orientation did not agree.",
  OUT_OF_RANGE: "Target is beyond maximum weapon range.",
  RANGE_CONTRADICTORY: "Camera distance and GPS distance disagreed too strongly.",
  DEV_EVIDENCE_NOT_ALLOWED: "Simulated aiming is disabled on this server.",
  PICKUP_UNAVAILABLE: "That pickup has already been collected and is respawning.",
  PICKUP_TOO_FAR: "Move closer to the pickup (within 5m) to collect it.",
  HEAL_COOLDOWN: "Heal cooldown active for this teammate (5s per target).",
  HEAL_FULL_HEALTH: "Teammate is already at full health.",
  HEAL_SELF: "Healers cannot heal themselves.",
  RATE_LIMITED: "Too many requests sent — slow down briefly.",
  DUPLICATE_REQUEST: "Duplicate action request ignored.",
  MALFORMED: "Request payload was malformed.",
};

export function formatRejectReason(reason: RejectReason): string {
  return REJECT_REASON_MESSAGES[reason] ?? `Action rejected (${reason})`;
}

/**
 * Exhaustive human-readable descriptions for every ErrorCode (PLAN.md Appendix 1).
 */
export const ERROR_CODE_LABELS: Record<ErrorCode, string> = {
  BAD_MESSAGE: "Invalid Request",
  UNAUTHENTICATED: "Authentication Required",
  SESSION_EXPIRED: "Session Expired",
  PROTOCOL_VERSION_MISMATCH: "Protocol Version Mismatch",
  WRONG_PHASE: "Wrong Match Phase",
  NOT_HOST: "Host Permission Required",
  INVALID_CONFIG: "Invalid Match Configuration",
  LOBBY_FULL: "Lobby Full",
  MATCH_NOT_FOUND: "Match Not Found",
  RATE_LIMITED: "Rate Limited",
  INTERNAL: "Server Notice",
};

/**
 * Human-readable recovery guidance for camera/orientation sensor issues (PLAN.md P5.3 & S9.8).
 */
export const AIM_UNAVAILABLE_INFO: Record<
  AimUnavailableReason,
  { title: string; guidance: string; canRetry: boolean }
> = {
  camera_denied: {
    title: "Camera Permission Denied",
    guidance:
      "FANTOM needs camera access to detect player markers when aiming. Video is processed locally and never uploaded. Enable camera access in your browser settings and tap Retry.",
    canRetry: true,
  },
  no_camera: {
    title: "No Rear Camera Detected",
    guidance: "Could not find a usable camera on this device. Connect or enable a camera and tap Retry.",
    canRetry: true,
  },
  orientation_denied: {
    title: "Orientation Sensor Permission Denied",
    guidance:
      "FANTOM compares compass/gyroscope direction with camera aim to validate hits. Tap Retry to grant motion & orientation permission.",
    canRetry: true,
  },
  orientation_unsupported: {
    title: "Orientation Sensor Unavailable",
    guidance:
      "This browser or device does not expose device orientation events. Open FANTOM on a modern iOS Safari or Android Chrome phone.",
    canRetry: false,
  },
  insecure_context: {
    title: "HTTPS Required for Camera & Sensors",
    guidance:
      "Mobile browsers block camera, orientation, and GPS on insecure HTTP URLs. Open the match via the HTTPS tunnel URL (pnpm dev:tunnel).",
    canRetry: false,
  },
  sensors_stale: {
    title: "Sensor Readings Stale or Noisy",
    guidance:
      "Camera or orientation readings stopped updating reliably. Hold the phone steady in an open area away from magnetic interference and recalibrate.",
    canRetry: true,
  },
  unsupported_browser: {
    title: "Browser Not Supported for Aiming",
    guidance: "Please open this link in iOS Safari or Android Chrome.",
    canRetry: false,
  },
};

export type TeamVisualBadge = {
  id: string;
  label: string;
  symbol: string;
  color: string;
  bgColor: string;
};

const TEAM_PALETTE: Array<{ symbol: string; color: string; bgColor: string }> = [
  { symbol: "◆", color: "#38bdf8", bgColor: "#0c4a6e" },
  { symbol: "▲", color: "#fbbf24", bgColor: "#78350f" },
  { symbol: "●", color: "#34d399", bgColor: "#064e3b" },
  { symbol: "■", color: "#f472b6", bgColor: "#831843" },
];

/**
 * Returns a non-color-only team indicator (symbol + text + color, per S11.4 & P7 M5).
 */
export function getTeamBadge(teamId: string | null): TeamVisualBadge | null {
  if (!teamId) return null;
  const match = teamId.match(/(\d+)/);
  const idx = match ? Math.max(0, (Number(match[1]) - 1) % TEAM_PALETTE.length) : 0;
  const style = TEAM_PALETTE[idx]!;
  return {
    id: teamId,
    label: teamId.toUpperCase().replace("-", " "),
    symbol: style.symbol,
    color: style.color,
    bgColor: style.bgColor,
  };
}

export const ROLE_INFO: Record<
  PlayerRole,
  { badge: string; icon: string; summary: string; canFire: boolean; canHeal: boolean }
> = {
  killer: {
    badge: "KILLER",
    icon: "⌖",
    summary: "Eliminate opposing team players. Starts with Pulse.",
    canFire: true,
    canHeal: false,
  },
  healer: {
    badge: "HEALER",
    icon: "✚",
    summary: "Restore +25 HP to teammates within 5m (5s cooldown/target). Cannot carry weapons or self-heal.",
    canFire: false,
    canHeal: true,
  },
  assassin: {
    badge: "ASSASSIN",
    icon: "⚡",
    summary: "Hunt and eliminate all Survivors before time expires. Only the Assassin can fire.",
    canFire: true,
    canHeal: false,
  },
  survivor: {
    badge: "SURVIVOR",
    icon: "⛨",
    summary: "Evade the Assassin and survive until the match timer runs out. Survivors cannot fire.",
    canFire: false,
    canHeal: false,
  },
};
