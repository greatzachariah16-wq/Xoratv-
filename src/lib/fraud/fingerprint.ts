import { hashString, murmurhash3_32 } from "./hash";
import type {
  AudioFingerprint,
  CanvasFingerprint,
  DeviceFingerprint,
  EnvironmentFlags,
  HardwareVector,
  WebGLFingerprint,
} from "./types";

/**
 * Extracts a stable canvas fingerprint using complex geometry,
 * multi-font fallback rendering, emojis, winding rules, and alpha blending.
 */
export function getCanvasFingerprint(): CanvasFingerprint {
  if (typeof document === "undefined") {
    return {
      hash: "server_canvas",
      windingSupported: false,
      textMetricsHash: "0",
      dataUrlSnippet: "",
    };
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 70;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return {
        hash: "no_canvas_ctx",
        windingSupported: false,
        textMetricsHash: "0",
        dataUrlSnippet: "",
      };
    }

    // Geometry & Winding rule test
    ctx.rect(0, 0, 10, 10);
    ctx.rect(2, 2, 6, 6);
    const windingSupported = ctx.isPointInPath(5, 5, "evenodd");

    // Complex canvas scene
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);

    ctx.fillStyle = "#069";
    ctx.font = "14px 'Arial', 'Helvetica', sans-serif";
    ctx.fillText("XoraTV Security Shield 🛡️", 4, 17);

    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.font = "16px 'Times New Roman', serif";
    ctx.fillText("Antifraud 100% 🎬", 6, 42);

    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.fillStyle = "#e11d48";
    ctx.beginPath();
    ctx.arc(200, 45, 15, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();

    const dataUrl = canvas.toDataURL();
    const hash = murmurhash3_32(dataUrl);

    // Text metrics test
    const m1 = ctx.measureText("XoraTV Security Shield 🛡️").width;
    const m2 = ctx.measureText("Antifraud 100% 🎬").width;
    const textMetricsHash = hashString(`${m1}_${m2}`);

    return {
      hash,
      windingSupported,
      textMetricsHash,
      dataUrlSnippet: dataUrl.slice(0, 40),
    };
  } catch {
    return {
      hash: "canvas_error",
      windingSupported: false,
      textMetricsHash: "0",
      dataUrlSnippet: "",
    };
  }
}

/**
 * Inspects WebGL GPU vendor, renderer, shader capabilities, and headless signatures.
 */
export function getWebGLFingerprint(): WebGLFingerprint {
  if (typeof document === "undefined") {
    return {
      hash: "server_webgl",
      vendor: "none",
      renderer: "none",
      unmaskedVendor: "none",
      unmaskedRenderer: "none",
      isHeadlessGpu: false,
      maxTextureSize: 0,
      extensionsCount: 0,
    };
  }

  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (!gl) {
      return {
        hash: "no_webgl",
        vendor: "none",
        renderer: "none",
        unmaskedVendor: "none",
        unmaskedRenderer: "none",
        isHeadlessGpu: false,
        maxTextureSize: 0,
        extensionsCount: 0,
      };
    }

    const vendor = gl.getParameter(gl.VENDOR) || "";
    const renderer = gl.getParameter(gl.RENDERER) || "";
    let unmaskedVendor = "";
    let unmaskedRenderer = "";

    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) {
      unmaskedVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || "";
      unmaskedRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
    }

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    const extensions = gl.getSupportedExtensions() || [];
    const extensionsCount = extensions.length;

    // Detect headless emulation or virtualized GPUs common in automated scripts
    const lowerRenderer = (unmaskedRenderer || renderer).toLowerCase();
    const isHeadlessGpu =
      lowerRenderer.includes("swiftshader") ||
      lowerRenderer.includes("llvmpipe") ||
      lowerRenderer.includes("virtualbox") ||
      lowerRenderer.includes("vmware") ||
      lowerRenderer.includes("mesa offscreen") ||
      lowerRenderer.includes("software rasterizer") ||
      lowerRenderer.includes("google swiftshader");

    const rawData = `${vendor}|${renderer}|${unmaskedVendor}|${unmaskedRenderer}|${maxTextureSize}|${extensionsCount}`;
    const hash = murmurhash3_32(rawData);

    return {
      hash,
      vendor: String(vendor),
      renderer: String(renderer),
      unmaskedVendor: String(unmaskedVendor),
      unmaskedRenderer: String(unmaskedRenderer),
      isHeadlessGpu,
      maxTextureSize: Number(maxTextureSize),
      extensionsCount,
    };
  } catch {
    return {
      hash: "webgl_error",
      vendor: "error",
      renderer: "error",
      unmaskedVendor: "error",
      unmaskedRenderer: "error",
      isHeadlessGpu: false,
      maxTextureSize: 0,
      extensionsCount: 0,
    };
  }
}

/**
 * Extracts an AudioContext dynamics and frequency profile hash.
 */
export async function getAudioFingerprint(): Promise<AudioFingerprint> {
  if (typeof window === "undefined") {
    return {
      hash: "server_audio",
      sampleRate: 0,
      maxChannelCount: 0,
      supported: false,
    };
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) {
      return {
        hash: "no_audio_api",
        sampleRate: 0,
        maxChannelCount: 0,
        supported: false,
      };
    }

    // Use a lightweight offline audio context to evaluate oscillator & dynamics compressor
    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;

    if (OfflineCtx) {
      const context = new OfflineCtx(1, 44100, 44100);
      const oscillator = context.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(10000, context.currentTime);

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-50, context.currentTime);
      compressor.knee.setValueAtTime(40, context.currentTime);
      compressor.ratio.setValueAtTime(12, context.currentTime);
      compressor.attack.setValueAtTime(0, context.currentTime);
      compressor.release.setValueAtTime(0.25, context.currentTime);

      oscillator.connect(compressor);
      compressor.connect(context.destination);
      oscillator.start(0);

      const renderedBuffer = await context.startRendering();
      const channelData = renderedBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 4500; i < 5000; i++) {
        sum += Math.abs(channelData[i]);
      }

      const reduction = compressor.reduction || 0;
      const hash = murmurhash3_32(`${context.sampleRate}_${sum.toFixed(6)}_${reduction}`);

      return {
        hash,
        sampleRate: context.sampleRate,
        maxChannelCount: context.destination.maxChannelCount || 2,
        dynamicsCompressorReduction: reduction,
        supported: true,
      };
    }

    // Fallback if offline context is unavailable
    const ctx = new AudioCtx();
    const sampleRate = ctx.sampleRate;
    const maxChannels = ctx.destination.maxChannelCount || 2;
    void ctx.close();

    return {
      hash: murmurhash3_32(`audio_${sampleRate}_${maxChannels}`),
      sampleRate,
      maxChannelCount: maxChannels,
      supported: true,
    };
  } catch {
    return {
      hash: "audio_error",
      sampleRate: 44100,
      maxChannelCount: 2,
      supported: false,
    };
  }
}

/**
 * Collects client hardware attributes and display vector.
 */
export function getHardwareVector(): HardwareVector {
  if (typeof window === "undefined" || typeof screen === "undefined") {
    return {
      screenResolution: "0x0",
      availableResolution: "0x0",
      colorDepth: 24,
      pixelRatio: 1,
      hardwareConcurrency: 4,
      deviceMemoryGB: null,
      maxTouchPoints: 0,
      timezone: "UTC",
      timezoneOffsetMinutes: 0,
      platform: "server",
      touchScreenSupported: false,
    };
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    timezone = "UTC";
  }

  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const touchScreenSupported = maxTouchPoints > 0 || "ontouchstart" in window;

  return {
    screenResolution: `${screen.width}x${screen.height}`,
    availableResolution: `${screen.availWidth}x${screen.availHeight}`,
    colorDepth: screen.colorDepth || 24,
    pixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency || 2,
    deviceMemoryGB: nav.deviceMemory || null,
    maxTouchPoints,
    timezone,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    platform: navigator.platform || "Unknown",
    touchScreenSupported,
  };
}

/**
 * Checks for automation flags and headless browser attributes.
 */
export function getEnvironmentFlags(): EnvironmentFlags {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      webdriver: false,
      phantomJs: false,
      nightmareJs: false,
      selenium: false,
      domAutomation: false,
      chromeRuntimeMissing: false,
      pluginsLength: 0,
      languages: ["en"],
    };
  }

  const win = window as unknown as Record<string, unknown>;

  const webdriver = Boolean(navigator.webdriver);
  const phantomJs = Boolean(win._phantom || win.callPhantom || win.phantom);
  const nightmareJs = Boolean(win.__nightmare);
  const selenium = Boolean(
    win.__selenium_evaluate ||
    (document as unknown as Record<string, unknown>).__webdriver_evaluate ||
    (document as unknown as Record<string, unknown>).__selenium_unwrapped,
  );
  const domAutomation = Boolean(win.domAutomation || win.domAutomationController);

  const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
  const chromeRuntimeMissing = isChrome && !win.chrome;

  return {
    webdriver,
    phantomJs,
    nightmareJs,
    selenium,
    domAutomation,
    chromeRuntimeMissing,
    pluginsLength: navigator.plugins ? navigator.plugins.length : 0,
    languages: Array.from(navigator.languages || [navigator.language]),
  };
}

/**
 * Generates a full, deterministic device fingerprint.
 * The resulting `fingerprintId` remains constant even if the user changes accounts or emails.
 */
export async function generateDeviceFingerprint(): Promise<DeviceFingerprint> {
  const canvas = getCanvasFingerprint();
  const webgl = getWebGLFingerprint();
  const audio = await getAudioFingerprint();
  const hardware = getHardwareVector();
  const environment = getEnvironmentFlags();

  // Combine stable hardware and rendering vectors
  const compositeSignature = [
    canvas.hash,
    canvas.textMetricsHash,
    webgl.unmaskedRenderer || webgl.renderer,
    webgl.unmaskedVendor || webgl.vendor,
    webgl.maxTextureSize,
    audio.hash,
    hardware.screenResolution,
    hardware.colorDepth,
    hardware.pixelRatio,
    hardware.hardwareConcurrency,
    hardware.timezone,
    hardware.platform,
    hardware.maxTouchPoints,
  ].join("###");

  const fingerprintId = `xora_dev_${murmurhash3_32(compositeSignature)}`;

  return {
    fingerprintId,
    canvas,
    webgl,
    audio,
    hardware,
    environment,
    collectedAt: new Date().toISOString(),
  };
}
