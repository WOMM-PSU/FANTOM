#!/usr/bin/env node
/**
 * Expose the local web app and game server through two Cloudflare quick tunnels,
 * then start the normal dev stack with the tunnel URLs in its environment.
 *
 * DEV ONLY. Quick tunnels are public URLs; they are not a deployment and have no
 * access control beyond the unguessable hostname. Stop the process to close them.
 *
 * Requirements:
 *   - cloudflared on PATH, or CLOUDFLARED_BIN=/path/to/cloudflared
 *   - the web dev server and game server will be started by `pnpm dev`
 *
 * Usage:
 *   pnpm dev:tunnel
 *   WEB_PORT=3000 SERVER_PORT=8080 pnpm dev:tunnel
 *   START_APP=false pnpm dev:tunnel   # tunnels only; useful for testing
 */
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import qrcodeTerminal from "qrcode-terminal";

const WEB_PORT = portEnv("WEB_PORT", 3000);
const SERVER_PORT = portEnv("SERVER_PORT", 8080);
const WEB_PATH = webPathEnv("WEB_PATH", "/");
const START_APP = process.env.START_APP !== "false";
const CLOUDFLARED = process.env.CLOUDFLARED_BIN || "cloudflared";
const TUNNEL_TIMEOUT_MS = positiveEnv("TUNNEL_TIMEOUT_MS", 30_000);
const CLOUDFLARED_PROTOCOL = process.env.CLOUDFLARED_PROTOCOL || "";

/** @type {Array<{ name: string, url: string, child: import("node:child_process").ChildProcess }>} */
const tunnels = [];
let app = null;
let shuttingDown = false;

function positiveEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    fail(`${name} must be a positive number (received ${JSON.stringify(raw)})`);
  }
  return value;
}

function portEnv(name, fallback) {
  const value = positiveEnv(name, fallback);
  if (!Number.isInteger(value) || value > 65_535) {
    fail(`${name} must be an integer between 1 and 65535`);
  }
  return value;
}

function webPathEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    fail(`${name} must be a path on the web tunnel origin, starting with "/" (received ${JSON.stringify(raw)})`);
  }
  return raw;
}

function fail(message) {
  console.error(`\n[dev:tunnel] ${message}\n`);
  process.exit(1);
}

function checkCloudflared() {
  const result = spawnSync(CLOUDFLARED, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    fail(
      [
        "cloudflared is required but was not found or did not run.",
        "Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
        "or set CLOUDFLARED_BIN to the binary path (for example CLOUDFLARED_BIN=./.tools/cloudflared/cloudflared).",
      ].join("\n  "),
    );
  }
  console.log(`[dev:tunnel] using ${CLOUDFLARED} (${result.stdout.trim().split("\n")[0]})`);
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function startTunnel(name, port) {
  return new Promise((resolve, reject) => {
    const args = ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"];
    if (CLOUDFLARED_PROTOCOL) args.push("--protocol", CLOUDFLARED_PROTOCOL);

    const child = spawn(CLOUDFLARED, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;

    const timer = setTimeout(() => {
      finish(new Error(`${name} tunnel did not print a URL within ${TUNNEL_TIMEOUT_MS} ms.\n${tail(output)}`));
    }, TUNNEL_TIMEOUT_MS);

    const finish = (error, url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        child.kill("SIGTERM");
        reject(error);
        return;
      }
      resolve({ name, url, child });
    };

    const onData = (chunk) => {
      const text = stripAnsi(chunk.toString());
      output += text;
      if (process.env.DEBUG_TUNNEL) process.stderr.write(text);
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(output);
      if (match) finish(null, match[0]);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => finish(error));
    child.on("exit", (code, signal) => {
      if (settled) {
        // The tunnel was previously established. Fail the whole process so a
        // half-working phone session does not look healthy.
        if (!shuttingDown) {
          console.error(`[dev:tunnel] ${name} tunnel exited unexpectedly (code ${code}, signal ${signal}).`);
          shutdown(1);
        }
        return;
      }
      finish(
        new Error(
          `${name} tunnel exited before a URL was available (code ${code}, signal ${signal}).\n${tail(output)}`,
        ),
      );
    });
  });
}

function tail(value, lines = 20) {
  return value.split("\n").slice(-lines).join("\n");
}

function openUrl(tunnelUrl, path) {
  const base = new URL(tunnelUrl);
  const target = new URL(path, base);
  // A path is not allowed to escape the tunnel origin (e.g. "//evil.example").
  if (target.origin !== base.origin) {
    stopTunnels();
    fail(`WEB_PATH must stay on the web tunnel origin (received ${JSON.stringify(path)})`);
  }
  return target.toString();
}

function printQr(url) {
  if (process.env.NO_QR === "1") return;
  qrcodeTerminal.generate(url, { small: true }, (code) => {
    console.log("  Scan with a phone camera:");
    console.log(
      code
        .trimEnd()
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
    );
    console.log("");
  });
}

function printUrls(web, api) {
  const wsUrl = `wss://${new URL(api.url).host}/ws`;
  const webUrl = openUrl(web.url, WEB_PATH);
  console.log("");
  console.log(`  Web:  ${webUrl}`);
  if (WEB_PATH !== "/") console.log(`  Base: ${new URL(web.url).origin}`);
  console.log(`  API:  ${api.url}`);
  console.log(`  WS:   ${wsUrl}`);
  console.log("");
  console.log("  Open the Web HTTPS URL on each phone. Camera/sensors need that secure context.");
  console.log("  These quick tunnels are public while this process runs; dev data only.");
  console.log("");
  printQr(webUrl);
}

function childEnv(web, api) {
  const webOrigin = new URL(web.url).origin;
  const apiOrigin = new URL(api.url).origin;
  return {
    ...process.env,
    WEB_BASE_URL: webOrigin,
    // The tunnel origin is the browser origin; keep localhost for desktop checks.
    ALLOWED_ORIGINS: `${webOrigin},http://localhost:${WEB_PORT}`,
    NEXT_PUBLIC_API_URL: apiOrigin,
    NEXT_PUBLIC_WS_URL: `wss://${new URL(api.url).host}/ws`,
  };
}

function stopTunnels() {
  for (const tunnel of tunnels) {
    if (tunnel.child.exitCode === null && !tunnel.child.killed) {
      tunnel.child.kill("SIGTERM");
    }
  }
}

function stopApp() {
  if (!app || app.exitCode !== null) return;
  if (process.platform !== "win32" && app.pid !== undefined) {
    try {
      process.kill(-app.pid, "SIGTERM");
      return;
    } catch {
      // Fall back to killing the direct child.
    }
  }
  app.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[dev:tunnel] shutting down…");
  stopApp();
  stopTunnels();
  setTimeout(() => process.exit(code), 750).unref();
}

async function main() {
  checkCloudflared();

  console.log(`[dev:tunnel] opening quick tunnels to web :${WEB_PORT} and server :${SERVER_PORT}…`);
  const track = (promise) =>
    promise.then((tunnel) => {
      tunnels.push(tunnel);
      return tunnel;
    });

  const [web, api] = await Promise.all([
    track(startTunnel("web", WEB_PORT)),
    track(startTunnel("api", SERVER_PORT)),
  ]).catch((error) => {
    stopTunnels();
    fail(error.message);
  });

  printUrls(web, api);

  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));

  if (!START_APP) {
    console.log("[dev:tunnel] START_APP=false: tunnels are running; press Ctrl+C to stop.");
    return;
  }

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  app = spawn(pnpm, ["dev"], {
    stdio: "inherit",
    env: childEnv(web, api),
    detached: process.platform !== "win32",
  });

  app.on("error", (error) => {
    console.error(`[dev:tunnel] could not start pnpm dev: ${error.message}`);
    shutdown(1);
  });
  app.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`[dev:tunnel] pnpm dev exited (code ${code}, signal ${signal}).`);
    stopTunnels();
    process.exit(code ?? 1);
  });
}

void main().catch((error) => {
  stopTunnels();
  fail(error instanceof Error ? error.message : String(error));
});
