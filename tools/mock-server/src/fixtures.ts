/**
 * Golden fixture loader for `@fantom/mock-server` (PLAN.md P5.1 & P6).
 * Reads the canonical `MATCH_STATE` JSON fixtures from `packages/shared/fixtures/server/`
 * and validates them through `@fantom/shared`'s `ServerMessage` zod schema.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ServerMessage, type MatchState } from "@fantom/shared";

export const MOCK_FIXTURE_SCENARIOS = [
  "lobby",
  "countdown",
  "active-ffa",
  "out-of-zone",
  "assassin-hidden",
  "team-deathmatch",
  "finished",
] as const;

export type MockFixtureScenario = (typeof MOCK_FIXTURE_SCENARIOS)[number];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_FIXTURES_DIR = path.resolve(
  __dirname,
  "../../../packages/shared/fixtures/server"
);

export function isMockFixtureScenario(value: string): value is MockFixtureScenario {
  return (MOCK_FIXTURE_SCENARIOS as readonly string[]).includes(value);
}

/**
 * Loads and schema-validates a golden `MATCH_STATE` fixture from `packages/shared/fixtures/server/`.
 */
export function loadFixtureMatchState(scenario: MockFixtureScenario): MatchState {
  const filename = `match-state-${scenario}.json`;
  const fullPath = path.join(SERVER_FIXTURES_DIR, filename);
  const raw = fs.readFileSync(fullPath, "utf8");
  const json: unknown = JSON.parse(raw);
  const parsed = ServerMessage.parse(json);
  if (parsed.type !== "MATCH_STATE") {
    throw new Error(`Expected MATCH_STATE in ${filename}, got ${parsed.type}`);
  }
  return parsed.payload;
}

export function loadAllFixtureMatchStates(): Record<MockFixtureScenario, MatchState> {
  const out = {} as Record<MockFixtureScenario, MatchState>;
  for (const scenario of MOCK_FIXTURE_SCENARIOS) {
    out[scenario] = loadFixtureMatchState(scenario);
  }
  return out;
}
