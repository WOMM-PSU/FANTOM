# Aim lab — standalone spike

**SPIKE ONLY. This is not gameplay, not the production aiming UI, and not evidence that camera
aiming works.** It exists so the M1 marker/posture questions can be tested on real phones before the
rest of the app lands.

## Run

```bash
node apps/web/features/aiming/dev/serve.mjs
# open http://localhost:4173/aim-lab.html
```

`PORT=4174 node …` changes the port. No dependencies are needed.

## Real-phone testing

Camera, device orientation, and geolocation require a **secure context**. `localhost` is secure;
plain LAN HTTP is not. Expose the static server through the repo's HTTPS tunnel helper:

```bash
node apps/web/features/aiming/dev/serve.mjs &
WEB_PORT=4173 WEB_PATH=/aim-lab.html START_APP=false \
  CLOUDFLARED_BIN=./.tools/cloudflared/cloudflared pnpm dev:tunnel
# scan the printed QR code (or open the printed Web URL) on both phones
```

Alternatively, if `cloudflared` is on `PATH`, `cloudflared tunnel --url http://localhost:4173`.
The tunnel transport has been smoke-tested locally, but **no phone has opened this lab yet**. Use
the HTTPS URL the tunnel prints; do not use the LAN HTTP address for camera/sensor tests. The quick
tunnel is public while it runs, so stop it when the test ends.

Two-phone posture test:

1. Phone B: **Target marker**, choose a code, tap **Large marker**, turn brightness up.
2. Phone A: **Aim**, **Start camera**, point at B's screen.
3. Record whether the marker is visible in a natural grip, at what distance it decodes, and whether
   both players can aim at each other at the same time.
4. Record the result in `docs/testing.md`. Do not record an expected result as observed.

## What it does

- Requests the rear camera; stops all tracks on Stop, tab switch, or page hide.
- Requests orientation permission from a user gesture (iOS) and shows raw alpha/beta/gamma, absolute
  vs. relative source, `webkitCompassHeading`, accuracy when exposed, and screen angle.
- Renders a QR-like marker carrying `FANTOM:1:<code>:<checksum>`; code is 0–255 and contains no
  session token.
- Detects QR markers locally with the native `BarcodeDetector` when available, otherwise with jsQR.
  Frames are processed in a canvas and never uploaded.
- Reports detection latency/FPS, bounding box, reticle offset, and an estimated distance from the
  configured hFOV and marker physical width.
- Flags more than one valid marker as ambiguous.

## Known limits

- It is a **QR candidate**, not a decision. ArUco-style and custom codes still need a fair comparison;
  do not treat this page as choosing the production codec.
- The detector APIs do not expose marker confidence or visible fraction; the lab shows "unavailable"
  instead of inventing values.
- hFOV is a manual input/estimate. A calibrated optical-axis heading is **not** implemented; the
  orientation readout is raw.
- iOS Safari may not support arbitrary-element fullscreen; the fallback "large marker" CSS mode is
  used instead.
- No real-device results have been recorded by the coding agent. The page has only been checked in a
  desktop browser.

## Vendored libraries (spike only)

See [`vendor/README.md`](vendor/README.md). These are not production dependencies.
