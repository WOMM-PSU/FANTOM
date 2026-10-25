import { qrcode } from "./vendor/qrcode.mjs";

const $ = (id) => document.getElementById(id);

const PROCESSING_WIDTH = 640;
const DETECTION_INTERVAL_MS = 100;

const state = {
  mode: "aim",
  stream: null,
  detector: null,
  detectorKind: "—",
  detectionTimer: null,
  detectionGeneration: 0,
  processing: null,
  processingCtx: null,
  lastDetection: null,
  fpsFrames: 0,
  fpsStartedAt: 0,
  fpsValue: 0,
  orientationActive: false,
  orientationLast: null,
  orientationHandlers: [],
};

function setText(id, value) {
  $(id).textContent = value;
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setAimStatus(message, kind = "") {
  const element = $("aim-status");
  element.textContent = message;
  element.className = kind ? `status ${kind}` : "status";
}

function markerChecksum(code) {
  return ((code * 37 + 11) & 0xff).toString(16).padStart(2, "0");
}

function markerPayload(code) {
  return `FANTOM:1:${code}:${markerChecksum(code)}`;
}

function parseMarker(rawValue) {
  const match = /^FANTOM:1:(\d{1,3}):([0-9a-f]{2})$/i.exec(rawValue ?? "");
  if (!match) {
    return { valid: false, reason: "not a FANTOM marker payload", code: null };
  }

  const code = Number(match[1]);
  if (!Number.isInteger(code) || code < 0 || code > 255) {
    return { valid: false, reason: "marker code outside 0–255", code: null };
  }

  const expected = markerChecksum(code);
  if (match[2].toLowerCase() !== expected) {
    return { valid: false, reason: "marker checksum mismatch", code: null };
  }

  return { valid: true, reason: null, code };
}

/* ───────────────────────────── tabs ───────────────────────────── */

function setMode(mode) {
  state.mode = mode;
  const isAim = mode === "aim";

  $("panel-aim").hidden = !isAim;
  $("panel-target").hidden = isAim;
  $("tab-aim").setAttribute("aria-selected", String(isAim));
  $("tab-target").setAttribute("aria-selected", String(!isAim));

  if (!isAim) {
    stopCamera("Camera stopped when switching to target mode.");
    stopOrientation("Orientation stopped when leaving the aim view.");
    exitMarkerFocus();
  }
}

$("tab-aim").addEventListener("click", () => setMode("aim"));
$("tab-target").addEventListener("click", () => setMode("target"));

/* ─────────────────────────── camera ──────────────────────────── */

function cameraErrorMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera permission denied. Allow camera access for this site in the browser settings, then retry.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera could not start; it may already be in use by another app.";
    case "OverconstrainedError":
      return "This camera does not support the requested video mode.";
    case "SecurityError":
      return "Camera access requires HTTPS or localhost (a secure context).";
    default:
      return `Camera error: ${error?.name ?? "unknown"} — ${error?.message ?? "could not start"}`;
  }
}

async function startCamera() {
  if (!window.isSecureContext) {
    setAimStatus("Camera requires HTTPS or localhost (a secure context).", "error");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setAimStatus("This browser does not expose getUserMedia.", "error");
    return;
  }

  $("camera-start").disabled = true;
  $("camera-note").textContent = "Requesting camera…";
  setAimStatus("Requesting camera permission…");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    state.stream = stream;
    const video = $("video");
    video.srcObject = stream;
    await video.play().catch(() => {
      // Autoplay is normally allowed because the video is muted; the frame
      // loop below still works once the browser starts the stream.
    });

    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    $("camera-note").textContent = `${settings.width ?? "?"}×${settings.height ?? "?"} camera`;
    $("camera-stop").disabled = false;
    setAimStatus("Camera running. Point it at a target marker.", "ok");

    await startDetection();
  } catch (error) {
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    $("camera-start").disabled = false;
    $("camera-stop").disabled = true;
    $("camera-note").textContent = "Camera unavailable";
    setAimStatus(cameraErrorMessage(error), "error");
  }
}

function stopCamera(message = "Camera stopped.") {
  state.detectionGeneration += 1;
  if (state.detectionTimer !== null) {
    clearTimeout(state.detectionTimer);
    state.detectionTimer = null;
  }

  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  const video = $("video");
  video.pause();
  video.srcObject = null;

  state.detector = null;
  state.detectorKind = "—";
  $("camera-start").disabled = false;
  $("camera-stop").disabled = true;
  $("camera-note").textContent = "Camera off";
  setText("metric-detector", "—");
  setText("metric-frame", "—");
  setText("metric-fps", "—");
  setText("metric-latency", "—");
  setAimStatus(message);
}

$("camera-start").addEventListener("click", () => {
  void startCamera();
});
$("camera-stop").addEventListener("click", () => stopCamera());

/* ───────────────────────── detection ─────────────────────────── */

async function createDetector() {
  const choice = $("detector").value;
  const hasBarcode = "BarcodeDetector" in window;
  let formats = [];

  if (hasBarcode) {
    try {
      formats = (await window.BarcodeDetector.getSupportedFormats?.()) ?? [];
    } catch {
      formats = [];
    }
  }

  const barcodeUsable = hasBarcode && (!formats.length || formats.includes("qr_code"));

  if ((choice === "auto" || choice === "barcode") && barcodeUsable) {
    try {
      return {
        kind: "barcode",
        detector: new window.BarcodeDetector({ formats: ["qr_code"] }),
      };
    } catch (error) {
      if (choice === "barcode") {
        throw new Error(`BarcodeDetector could not start: ${error?.message ?? error}`);
      }
    }
  }

  if ((choice === "auto" || choice === "jsqr") && typeof window.jsQR === "function") {
    return { kind: "jsqr", detector: null };
  }

  if (choice === "barcode") {
    throw new Error("BarcodeDetector is not available in this browser.");
  }
  throw new Error("No QR detector is available in this browser.");
}

async function startDetection() {
  const generation = ++state.detectionGeneration;

  try {
    const created = await createDetector();
    if (generation !== state.detectionGeneration) return;

    state.detector = created.detector;
    state.detectorKind = created.kind;
    state.fpsFrames = 0;
    state.fpsStartedAt = performance.now();
    state.fpsValue = 0;

    state.processing = document.createElement("canvas");
    state.processingCtx = state.processing.getContext("2d", { willReadFrequently: true });
    if (!state.processingCtx) {
      throw new Error("Canvas 2D is unavailable.");
    }

    setText("metric-detector", created.kind === "barcode" ? "BarcodeDetector" : "jsQR");
    setAimStatus(
      created.kind === "barcode"
        ? "Detecting with the browser's native BarcodeDetector."
        : "Detecting with jsQR (JavaScript fallback).",
      "ok",
    );
    scheduleDetection(generation);
  } catch (error) {
    setText("metric-detector", "unavailable");
    setAimStatus(`Detector error: ${error?.message ?? error}`, "error");
  }
}

function scheduleDetection(generation) {
  state.detectionTimer = setTimeout(() => {
    void detectFrame(generation);
  }, DETECTION_INTERVAL_MS);
}

function jsQrBoundingBox(found, width, height) {
  const location = found?.location;
  if (!location) {
    return { x: 0, y: 0, width, height };
  }

  const corners = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ].filter(Boolean);

  if (!corners.length) {
    return { x: 0, y: 0, width, height };
  }

  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(0, Math.max(...xs) - minX),
    height: Math.max(0, Math.max(...ys) - minY),
  };
}

async function detectFrame(generation) {
  if (generation !== state.detectionGeneration) return;

  const video = $("video");
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;

  if (!videoWidth || !videoHeight) {
    scheduleDetection(generation);
    return;
  }

  const width = PROCESSING_WIDTH;
  const height = Math.max(1, Math.round((width * videoHeight) / videoWidth));
  const canvas = state.processing;
  const ctx = state.processingCtx;

  if (!canvas || !ctx) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.drawImage(video, 0, 0, width, height);

  const startedAt = performance.now();
  let rawDetections = [];

  try {
    if (state.detectorKind === "barcode") {
      rawDetections = await state.detector.detect(canvas);
    } else {
      const image = ctx.getImageData(0, 0, width, height);
      const found = window.jsQR(image.data, width, height, {
        inversionAttempts: "dontInvert",
      });
      rawDetections = found
        ? [
            {
              rawValue: found.data,
              boundingBox: jsQrBoundingBox(found, width, height),
            },
          ]
        : [];
    }
  } catch (error) {
    if (generation !== state.detectionGeneration) return;
    setAimStatus(`Detection error: ${error?.message ?? error}`, "error");
    return;
  }

  const latencyMs = performance.now() - startedAt;
  state.fpsFrames += 1;
  const elapsed = performance.now() - state.fpsStartedAt;
  if (elapsed >= 1000) {
    state.fpsValue = (state.fpsFrames * 1000) / elapsed;
    state.fpsFrames = 0;
    state.fpsStartedAt = performance.now();
  }

  setText("metric-frame", `${width}×${height}`);
  setText("metric-latency", `${latencyMs.toFixed(1)} ms`);
  setText("metric-fps", state.fpsValue > 0 ? `${state.fpsValue.toFixed(1)} fps` : "—");

  renderDetections(rawDetections, width, height);

  if (generation === state.detectionGeneration) {
    scheduleDetection(generation);
  }
}

function renderDetections(rawDetections, width, height) {
  const container = $("detections");
  container.replaceChildren();

  const hfovDeg = clamp(Number.parseFloat($("hfov").value) || 60, 20, 120);
  const markerWidthM = Number.parseFloat($("marker-width").value) || 0.065;
  const vfovDeg =
    (2 * Math.atan(Math.tan((hfovDeg * Math.PI) / 360) * (height / width)) * 180) /
    Math.PI;
  const focalPx = width / 2 / Math.tan((hfovDeg * Math.PI) / 360);

  let validCount = 0;
  let rendered = 0;

  for (const detection of rawDetections) {
    const parsed = parseMarker(detection.rawValue);
    const box = detection.boundingBox;
    const boxWidth = box?.width ?? 0;
    const boxHeight = box?.height ?? 0;
    const centerX = (box?.x ?? 0) + boxWidth / 2;
    const centerY = (box?.y ?? 0) + boxHeight / 2;
    const offsetX = width ? ((centerX - width / 2) / width) * hfovDeg : null;
    const offsetY = height ? ((height / 2 - centerY) / height) * vfovDeg : null;
    const distanceM =
      boxWidth > 0 && markerWidthM > 0 ? (focalPx * markerWidthM) / boxWidth : null;

    if (parsed.valid) {
      validCount += 1;
      state.lastDetection = {
        code: parsed.code,
        payload: detection.rawValue,
        markerWidthPx: boxWidth,
        frameWidthPx: width,
        distanceM,
        detectedAt: performance.now(),
      };
      $("cal-observed").value = boxWidth > 0 ? boxWidth.toFixed(0) : "";
      $("cal-frame").value = String(width);
    }

    const item = document.createElement("div");
    item.className = `detection ${parsed.valid ? "valid" : "invalid"}`;

    const title = document.createElement("strong");
    title.textContent = parsed.valid
      ? `Marker ${parsed.code}`
      : "Rejected detection";
    item.append(title);

    const list = document.createElement("dl");
    const addRow = (label, value) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      list.append(dt, dd);
    };

    addRow("Payload", detection.rawValue ?? "—");
    addRow("Box", boxWidth && boxHeight ? `${boxWidth.toFixed(0)}×${boxHeight.toFixed(0)} px` : "n/a");
    addRow("Offset", offsetX === null ? "n/a" : `${formatNumber(offsetX)}° / ${formatNumber(offsetY)}°`);
    addRow("Distance", distanceM === null ? "n/a" : `${formatNumber(distanceM)} m (est.)`);
    addRow("Marker width", boxWidth ? `${boxWidth.toFixed(0)} px` : "n/a");
    if (!parsed.valid) {
      addRow("Reject reason", parsed.reason);
    }

    item.append(list);
    container.append(item);
    rendered += 1;
  }

  if (rendered === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No QR detected in the last frame.";
    container.append(empty);
  }

  if (validCount > 1) {
    const warning = document.createElement("p");
    warning.className = "status warn";
    warning.textContent = `${validCount} valid markers are visible. Production aiming must reject this as ambiguous.`;
    container.append(warning);
  }
}

$("detector").addEventListener("change", () => {
  if (state.stream) {
    state.detectionGeneration += 1;
    if (state.detectionTimer !== null) {
      clearTimeout(state.detectionTimer);
      state.detectionTimer = null;
    }
    void startDetection();
  }
});

/* ──────────────────────── orientation ───────────────────────── */

function headingSource(event) {
  if (Number.isFinite(event.webkitCompassHeading)) return "ios_compass";
  if (event.absolute || event.type === "deviceorientationabsolute") return "absolute";
  return "relative";
}

function candidateHeading(event) {
  if (Number.isFinite(event.webkitCompassHeading)) return event.webkitCompassHeading;
  if ((event.absolute || event.type === "deviceorientationabsolute") && Number.isFinite(event.alpha)) {
    return (360 - event.alpha) % 360;
  }
  return null;
}

function onOrientation(event) {
  state.orientationLast = event;

  setText("ori-event", event.type);
  setText("ori-source", headingSource(event));
  setText("ori-alpha", formatNumber(event.alpha, 2));
  setText("ori-beta", formatNumber(event.beta, 2));
  setText("ori-gamma", formatNumber(event.gamma, 2));
  setText("ori-absolute", String(Boolean(event.absolute)));
  setText(
    "ori-heading",
    Number.isFinite(event.webkitCompassHeading)
      ? `${formatNumber(event.webkitCompassHeading, 2)}°`
      : "not exposed",
  );
  setText(
    "ori-accuracy",
    Number.isFinite(event.webkitCompassAccuracy)
      ? `${formatNumber(event.webkitCompassAccuracy, 1)}°`
      : "not exposed",
  );
  setText(
    "ori-candidate",
    Number.isFinite(candidateHeading(event))
      ? `${formatNumber(candidateHeading(event), 2)}° (raw)`
      : "none (relative or missing)",
  );
  setText(
    "ori-screen",
    String(screen.orientation?.angle ?? window.orientation ?? "unknown"),
  );
}

async function startOrientation() {
  if (state.orientationActive) return;

  if (!("DeviceOrientationEvent" in window)) {
    setAimStatus("DeviceOrientationEvent is not available in this browser.", "error");
    return;
  }

  const OrientationEvent = window.DeviceOrientationEvent;
  if (typeof OrientationEvent.requestPermission === "function") {
    try {
      const permission = await OrientationEvent.requestPermission();
      if (permission !== "granted") {
        setAimStatus(
          "Orientation permission was not granted. Enable motion & orientation access for this site, then retry.",
          "error",
        );
        return;
      }
    } catch (error) {
      setAimStatus(
        `Orientation permission request failed: ${error?.message ?? error}. On iOS this must be triggered by a tap.`,
        "error",
      );
      return;
    }
  }

  state.orientationActive = true;
  state.orientationHandlers = [
    ["deviceorientationabsolute", onOrientation],
    ["deviceorientation", onOrientation],
  ];
  for (const [type, handler] of state.orientationHandlers) {
    window.addEventListener(type, handler, true);
  }

  $("orientation-start").disabled = true;
  $("orientation-stop").disabled = false;
  setAimStatus("Orientation listeners active. Move the phone to see raw sensor values.", "ok");

  setTimeout(() => {
    if (state.orientationActive && !state.orientationLast) {
      setAimStatus(
        "Orientation is enabled but no events have arrived. This browser may not expose the sensors.",
        "warn",
      );
    }
  }, 1500);
}

function stopOrientation(message = "Orientation stopped.") {
  if (!state.orientationActive) return;

  for (const [type, handler] of state.orientationHandlers) {
    window.removeEventListener(type, handler, true);
  }
  state.orientationActive = false;
  state.orientationHandlers = [];
  $("orientation-start").disabled = false;
  $("orientation-stop").disabled = true;
  setAimStatus(message);
}

$("orientation-start").addEventListener("click", () => {
  void startOrientation();
});
$("orientation-stop").addEventListener("click", () => stopOrientation());

/* ─────────────────────── calibration ───────────────────────── */

$("cal-apply").addEventListener("click", () => {
  const last = state.lastDetection;
  const distanceM = Number.parseFloat($("cal-distance").value);
  const observedPx = Number.parseFloat($("cal-observed").value) || last?.markerWidthPx;
  const frameWidthPx = Number.parseFloat($("cal-frame").value) || last?.frameWidthPx;
  const markerWidthM = Number.parseFloat($("marker-width").value);
  const result = $("cal-result");

  if (!(distanceM > 0 && observedPx > 0 && frameWidthPx > 0 && markerWidthM > 0)) {
    result.textContent = "Enter a measured distance, a detected marker width, and the marker width in metres.";
    return;
  }

  const focalPx = (distanceM * observedPx) / markerWidthM;
  const hfovDeg = (2 * Math.atan(frameWidthPx / (2 * focalPx)) * 180) / Math.PI;

  if (!(hfovDeg >= 20 && hfovDeg <= 120)) {
    result.textContent = `Estimated hFOV ${hfovDeg.toFixed(1)}° is outside 20–120°; check the measured distance and marker width.`;
    return;
  }

  $("hfov").value = hfovDeg.toFixed(1);
  result.textContent = `focal length ≈ ${focalPx.toFixed(0)} px; estimated hFOV ≈ ${hfovDeg.toFixed(1)}°. This is a manual calibration aid, not a verified device calibration.`;
});

/* ─────────────────────── target marker ──────────────────────── */

function renderMarker() {
  const input = $("marker-code");
  const raw = Number.parseInt(input.value, 10);
  if (!Number.isInteger(raw) || raw < 0 || raw > 255) {
    $("marker-payload").textContent = "invalid code (must be 0–255)";
    return;
  }

  const code = raw;
  input.value = String(code);
  const payload = markerPayload(code);

  try {
    const qr = qrcode(0, "M");
    qr.addData(payload);
    qr.make();

    const count = qr.getModuleCount();
    const quiet = 4;
    const cell = 10;
    const canvas = $("marker");
    canvas.width = (count + quiet * 2) * cell;
    canvas.height = canvas.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";

    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) {
          ctx.fillRect((quiet + col) * cell, (quiet + row) * cell, cell, cell);
        }
      }
    }

    $("marker-payload").textContent = payload;
  } catch (error) {
    $("marker-payload").textContent = `could not render marker: ${error?.message ?? error}`;
  }
}

$("marker-render").addEventListener("click", renderMarker);
$("marker-code").addEventListener("change", renderMarker);
$("marker-random").addEventListener("click", () => {
  $("marker-code").value = String(Math.floor(Math.random() * 256));
  renderMarker();
});

function exitMarkerFocus() {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
  }
  document.body.classList.remove("marker-focus");
  $("marker-exit").hidden = true;
  $("marker-focus").textContent = "Large marker";
}

async function toggleMarkerFocus() {
  if (document.fullscreenElement || document.body.classList.contains("marker-focus")) {
    exitMarkerFocus();
    return;
  }

  const stage = $("marker-stage");

  // Apply the CSS fallback immediately so a fullscreen request that is slow,
  // unsupported, or blocked cannot leave the marker in its normal layout.
  document.body.classList.add("marker-focus");
  $("marker-exit").hidden = false;
  $("marker-focus").textContent = "Exit large marker";

  if (typeof stage.requestFullscreen === "function") {
    try {
      await stage.requestFullscreen();
      document.body.classList.remove("marker-focus");
    } catch {
      // iOS Safari may not support arbitrary-element fullscreen; keep CSS fallback.
    }
  }
}

$("marker-focus").addEventListener("click", () => {
  void toggleMarkerFocus();
});
$("marker-exit").addEventListener("click", exitMarkerFocus);
document.addEventListener("fullscreenchange", () => {
  const fullscreen = Boolean(document.fullscreenElement);
  $("marker-exit").hidden = !fullscreen && !document.body.classList.contains("marker-focus");
});

/* ───────────────────────── initial state ────────────────────── */

function stopAll() {
  stopCamera("Camera stopped.");
  stopOrientation("Orientation stopped.");
  exitMarkerFocus();
}

window.addEventListener("pagehide", stopAll);
window.addEventListener("beforeunload", stopAll);

renderMarker();
setText(
  "metric-detector",
  "BarcodeDetector" in window ? "BarcodeDetector + jsQR" : window.jsQR ? "jsQR" : "none",
);

if (!window.isSecureContext) {
  setAimStatus(
    "This page is not a secure context. Camera and sensors require HTTPS or localhost.",
    "warn",
  );
} else if (!navigator.mediaDevices?.getUserMedia) {
  setAimStatus("This browser does not expose camera access.", "warn");
}
