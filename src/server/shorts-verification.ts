import { spawn } from "node:child_process";
import type { PostRecord } from "@/integrations/firebase/types";
import {
  getAllPosts,
  setPostRecord,
} from "@/integrations/firebase/rtdb";
import { getAdaptiveStreamingUrl } from "@/lib/cloudinary";

export type ShortsVerificationStatus = "playable" | "unplayable" | "unverified";

export interface ShortsVerificationResult {
  id: string;
  title: string | null;
  status: ShortsVerificationStatus;
  checkedAt: string;
  error?: string | null;
}

const VERIFY_TIMEOUT_MS = 18_000;
const MAX_CONCURRENT = 3;
const FAILURE_THRESHOLD = 2;

function resolveCandidateUrl(post: PostRecord): string | null {
  const raw = (post.stream_url || post.media_path || "").trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return raw.includes("res.cloudinary.com") && /\/video\/upload\//i.test(raw)
      ? getAdaptiveStreamingUrl(raw, undefined, 360)
      : raw;
  }

  // A stored Cloudinary public id can be turned into an HLS manifest.
  if (
    !raw.startsWith("/") &&
    !raw.startsWith("videos/") &&
    process.env.VITE_CLOUDINARY_CLOUD_NAME
  ) {
    const cloudinary = getAdaptiveStreamingUrl("", raw, 360);
    if (cloudinary) return cloudinary;
  }

  const base =
    process.env.PUBLIC_MEDIA_BASE_URL ||
    process.env.VITE_RENDER_BACKEND_URL ||
    "https://xoratv-x.onrender.com";
  return `${base.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "").startsWith("videos/")
    ? raw.replace(/^\/+/, "")
    : `videos/${raw.replace(/^\/+/, "")}`}`;
}

async function verifyProviderEmbed(url: string): Promise<{ ok: boolean; error?: string }> {
  const lower = url.toLowerCase();
  let endpoint: string | null = null;

  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  } else if (lower.includes("vimeo.com")) {
    endpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
  } else if (lower.includes("dailymotion.com")) {
    endpoint = `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(url)}&format=json`;
  }

  if (!endpoint) {
    return { ok: false, error: "Unsupported provider embed URL" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { "User-Agent": "XoraTV-Shorts-Verifier/1.0" },
    });
    if (!response.ok) {
      return { ok: false, error: `Provider returned HTTP ${response.status}` };
    }

    const body = (await response.json().catch(() => null)) as { type?: string; html?: string } | null;
    if (!body || (body.type && body.type !== "video") || !body.html) {
      return { ok: false, error: "Provider did not return an embeddable video" };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Provider verification failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyNativeMedia(url: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "3",
      "-t",
      "3",
      "-i",
      url,
      "-map",
      "0:v:0",
      "-f",
      "null",
      "-",
    ];

    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    let settled = false;

    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, error: "Playback verification timed out" });
    }, VERIFY_TIMEOUT_MS);

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    child.on("error", (error) => {
      finish({ ok: false, error: error.message });
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true });
      } else {
        const message = stderr.trim().split("\n").slice(-1)[0] || `FFmpeg exited with code ${code}`;
        finish({ ok: false, error: message });
      }
    });
  });
}

async function verifyPost(post: PostRecord): Promise<ShortsVerificationResult> {
  const checkedAt = new Date().toISOString();
  const url = resolveCandidateUrl(post);

  if (!url) {
    return { id: post.id, title: post.title, status: "unplayable", checkedAt, error: "No video URL" };
  }

  let verification: { ok: boolean; error?: string };

  // Provider embeds cannot be decoded by FFmpeg. Verify them through the provider's
  // official oEmbed endpoint instead; this catches deleted/private/non-embeddable videos.
  if (
    /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com/i.test(url) &&
    !/\.(?:mp4|webm|mov|m3u8)(?:[?#]|$)/i.test(url)
  ) {
    verification = await verifyProviderEmbed(url);
  } else {
    verification = await verifyNativeMedia(url);
  }

  return {
    id: post.id,
    title: post.title,
    status: verification.ok ? "playable" : "unplayable",
    checkedAt,
    error: verification.ok ? null : verification.error || "Media could not be decoded",
  };
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency = MAX_CONCURRENT,
) {
  let cursor = 0;

  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => runner()),
  );
}

export async function runShortsVerification(): Promise<{
  ok: boolean;
  checked: number;
  playable: number;
  hidden: number;
  errors: number;
  results: ShortsVerificationResult[];
}> {
  const allPosts = await getAllPosts();
  const candidates = allPosts.filter(
    (post) =>
      post.feed === "shorts" &&
      post.kind === "video" &&
      post.status === "published" &&
      post.approval_status === "approved",
  );

  const results: ShortsVerificationResult[] = [];
  await runWithConcurrency(candidates, async (post) => {
    const result = await verifyPost(post);
    results.push(result);

    const previousFailures = Math.max(0, Number(post.playability_failure_count || 0));
    const shouldHide =
      result.status === "unplayable"
        ? previousFailures + 1 >= FAILURE_THRESHOLD
        : false;

    const nextStatus =
      result.status === "playable"
        ? "playable"
        : shouldHide
          ? "unplayable"
          : post.playability_status || "unverified";

    await setPostRecord({
      ...post,
      playability_status: nextStatus,
      playability_checked_at: result.checkedAt,
      playability_failure_count: result.status === "playable" ? 0 : previousFailures + 1,
      playability_error: result.status === "playable" ? null : result.error || null,
    });
  });

  return {
    ok: true,
    checked: results.length,
    playable: results.filter((r) => r.status === "playable").length,
    hidden: results.filter((r) => r.status === "unplayable").length,
    errors: results.filter((r) => r.error).length,
    results: results.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
