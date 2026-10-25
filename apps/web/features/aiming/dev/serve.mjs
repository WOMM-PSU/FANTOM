#!/usr/bin/env node
/**
 * Static server for the aim-lab spike. No dependencies.
 *
 *   node apps/web/features/aiming/dev/serve.mjs
 *   PORT=4174 node apps/web/features/aiming/dev/serve.mjs
 *
 * Camera and orientation need a secure context. localhost counts; phones do
 * not, so expose this through an HTTPS tunnel for real-device tests.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const requestedPort = Number(process.env.PORT);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 4173;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy":
    "camera=(self), microphone=(), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)",
};

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const filePath = resolve(ROOT, `.${decoded}`);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) return null;
  return filePath;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = url.pathname === "/" ? "/aim-lab.html" : url.pathname;
    const filePath = safePath(pathname);

    if (!filePath) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const info = await stat(filePath);
    if (!info.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": body.byteLength,
    });
    response.end(body);
  } catch (error) {
    const notFound = error?.code === "ENOENT" || error?.code === "ENOTDIR";
    response.writeHead(notFound ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(notFound ? "Not found" : "Server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Aim lab: http://localhost:${PORT}/aim-lab.html`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        console.log(`LAN:     http://${address.address}:${PORT}/aim-lab.html`);
      }
    }
  }
  console.log("");
  console.log("Phones need HTTPS for camera/orientation; LAN HTTP is not a secure context.");
  console.log("Use an HTTPS tunnel (e.g. cloudflared) or deploy this page before real-device tests.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
