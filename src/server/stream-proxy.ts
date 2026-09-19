import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getFaoTvStreamUrl } from "../integrations/providers/faotv";
import { xseriesDbRead } from "./xseries-service-account";
import { extractYouTubeId } from "./xseries-crawler";

const execFileAsync = promisify(execFile);

// Temporary cache settings
const CACHE_DIR = process.env.TEMP_STREAM_CACHE_DIR || path.join(os.tmpdir(), "xora-stream-cache");
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL
const MAX_CACHE_BYTES = 500 * 1024 * 1024; // 500 MB disk cap

// Ensure cache directory exists on startup
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("[Stream Cache] Failed to create cache directory:", e);
}

interface CacheMetadata {
  key: string;
  sourceUrl: string;
  contentType: string;
  contentLength: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
  complete: boolean;
}

// Memory index for quick cache lookup
const cacheIndex = new Map<string, CacheMetadata>();

function hashKey(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 32);
}

function getCachePaths(key: string) {
  return {
    metaFile: path.join(CACHE_DIR, `${key}.meta.json`),
    dataFile: path.join(CACHE_DIR, `${key}.data`),
  };
}

// Purge expired cache files
export function cleanExpiredStreamCache(): { purged: number; remaining: number } {
  const now = Date.now();
  let purged = 0;

  try {
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith(".meta.json")) continue;
      const metaPath = path.join(CACHE_DIR, file);
      const dataPath = path.join(CACHE_DIR, file.replace(/\.meta\.json$/, ".data"));

      try {
        const raw = fs.readFileSync(metaPath, "utf-8");
        const meta: CacheMetadata = JSON.parse(raw);

        if (now > meta.expiresAt) {
          if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
          if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
          cacheIndex.delete(meta.key);
          purged++;
        } else {
          cacheIndex.set(meta.key, meta);
        }
      } catch (_err) {
        // Corrupted file, remove
        try {
          if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
          if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        } catch (_ignore) {
          // Ignore deletion error
        }
      }
    }

    // Disk space enforcement (LRU eviction if over MAX_CACHE_BYTES)
    enforceCacheSizeLimit();
  } catch (err) {
    console.warn("[Stream Cache] Error during cleanup:", err);
  }

  return { purged, remaining: cacheIndex.size };
}

function enforceCacheSizeLimit() {
  try {
    const entries = Array.from(cacheIndex.values()).sort(
      (a, b) => a.lastAccessedAt - b.lastAccessedAt,
    );
    let totalSize = 0;

    for (const entry of entries) {
      const { dataFile } = getCachePaths(entry.key);
      try {
        if (fs.existsSync(dataFile)) {
          totalSize += fs.statSync(dataFile).size;
        }
      } catch (_statErr) {
        // Ignore stat error
      }
    }

    while (totalSize > MAX_CACHE_BYTES && entries.length > 0) {
      const oldest = entries.shift();
      if (!oldest) break;
      const { metaFile, dataFile } = getCachePaths(oldest.key);
      try {
        if (fs.existsSync(dataFile)) {
          totalSize -= fs.statSync(dataFile).size;
          fs.unlinkSync(dataFile);
        }
        if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
      } catch (_delErr) {
        // Ignore deletion error
      }
      cacheIndex.delete(oldest.key);
    }
  } catch (err) {
    console.warn("[Stream Cache] Error enforcing size limit:", err);
  }
}

// Immediate purge on demand
export function purgeStreamCache(key: string): boolean {
  try {
    const { metaFile, dataFile } = getCachePaths(key);
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
    if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
    cacheIndex.delete(key);
    return true;
  } catch {
    return false;
  }
}

// Start periodic cleanup timer (every 5 minutes)
setInterval(
  () => {
    cleanExpiredStreamCache();
  },
  5 * 60 * 1000,
).unref();

// Initial cleanup sweep on module load
cleanExpiredStreamCache();

// Standalone yt-dlp binary resolution & auto-bootstrap
let ytdlpPathCache: string | null = null;

async function getYtDlpPath(): Promise<string | null> {
  if (ytdlpPathCache && fs.existsSync(ytdlpPathCache)) {
    return ytdlpPathCache;
  }

  // Check project bin directory first
  const projectBin = path.join(process.cwd(), "bin", "yt-dlp");
  if (fs.existsSync(projectBin)) {
    ytdlpPathCache = projectBin;
    return projectBin;
  }

  // Check /tmp/yt-dlp
  const tmpBin = path.join(os.tmpdir(), "yt-dlp");
  if (fs.existsSync(tmpBin)) {
    ytdlpPathCache = tmpBin;
    return tmpBin;
  }

  // Check system PATH
  try {
    const { stdout } = await execFileAsync("which", ["yt-dlp"]);
    const trimmed = stdout.trim();
    if (trimmed && fs.existsSync(trimmed)) {
      ytdlpPathCache = trimmed;
      return trimmed;
    }
  } catch (_whichErr) {
    // Ignore which error
  }

  // Auto-download standalone binary if missing
  try {
    console.log("[Stream Proxy] Bootstrapping yt-dlp binary...");
    const destDir = fs.existsSync(path.join(process.cwd(), "bin"))
      ? path.join(process.cwd(), "bin")
      : os.tmpdir();
    const destFile = path.join(destDir, "yt-dlp");

    const dlRes = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp", {
      signal: AbortSignal.timeout(30000),
    });

    if (dlRes.ok && dlRes.body) {
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(destFile, buffer, { mode: 0o755 });
      ytdlpPathCache = destFile;
      console.log("[Stream Proxy] yt-dlp successfully installed to", destFile);
      return destFile;
    }
  } catch (err) {
    console.warn("[Stream Proxy] Could not auto-download yt-dlp:", err);
  }

  return null;
}

export interface ResolvedStream {
  streamUrl: string;
  contentType: string;
  provider: string;
  isHls: boolean;
}

// Dynamic stream URL extractor
export async function extractStreamUrl(
  sourceUrl: string,
  providerHint?: string,
): Promise<ResolvedStream> {
  const cleanUrl = sourceUrl.trim();
  const urlObj = new URL(cleanUrl);
  const host = urlObj.hostname.replace(/^www\./, "").toLowerCase();

  // 1. Direct media formats (MP4, WebM, M3U8, MPD)
  if (/\.(mp4|webm|m3u8|mpd)(\?.*)?$/i.test(cleanUrl)) {
    const isHls = cleanUrl.includes(".m3u8");
    return {
      streamUrl: cleanUrl,
      contentType: isHls ? "application/x-mpegURL" : "video/mp4",
      provider: "direct",
      isHls,
    };
  }

  // 2. FaoTV provider channels
  if (providerHint === "faotv" || host.includes("teamraven.online")) {
    const channelId =
      urlObj.searchParams.get("id") || urlObj.pathname.split("/").filter(Boolean).pop() || "";
    const faoStream = await getFaoTvStreamUrl(channelId);
    if (faoStream) {
      return {
        streamUrl: faoStream,
        contentType: "application/x-mpegURL",
        provider: "faotv",
        isHls: true,
      };
    }
  }

  // 3. Vimeo extraction via config JSON
  if (host.includes("vimeo.com")) {
    const vimeoId = urlObj.pathname.match(/(?:video\/)?(\d{5,15})/)?.[1];
    if (vimeoId) {
      try {
        const configRes = await fetch(`https://player.vimeo.com/video/${vimeoId}/config`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          signal: AbortSignal.timeout(8000),
        });
        if (configRes.ok) {
          interface VimeoProgressiveFile {
            width?: number;
            url?: string;
          }
          interface VimeoConfig {
            request?: {
              files?: {
                progressive?: VimeoProgressiveFile[];
                hls?: {
                  default_cdn?: { url?: string };
                  cdns?: { fastly?: { url?: string } };
                };
              };
            };
          }
          const cfg = (await configRes.json()) as VimeoConfig;
          // Check progressive MP4 files
          const progressive = cfg?.request?.files?.progressive;
          if (Array.isArray(progressive) && progressive.length > 0) {
            // Pick highest quality (e.g. 1080p or 720p)
            progressive.sort(
              (a: VimeoProgressiveFile, b: VimeoProgressiveFile) => (b.width || 0) - (a.width || 0),
            );
            if (progressive[0]?.url) {
              return {
                streamUrl: progressive[0].url,
                contentType: "video/mp4",
                provider: "vimeo",
                isHls: false,
              };
            }
          }
          // Check HLS stream
          const hlsUrl =
            cfg?.request?.files?.hls?.default_cdn?.url ||
            cfg?.request?.files?.hls?.cdns?.fastly?.url;
          if (hlsUrl) {
            return {
              streamUrl: hlsUrl,
              contentType: "application/x-mpegURL",
              provider: "vimeo",
              isHls: true,
            };
          }
        }
      } catch (e) {
        console.warn("[Stream Extractor] Vimeo config fetch failed, trying yt-dlp fallback:", e);
      }
    }
  }

  // 4. YouTube and general video sites via yt-dlp
  const ytdlp = await getYtDlpPath();
  if (ytdlp) {
    try {
      const args = [
        "--js-runtimes",
        "node:node",
        "--no-warnings",
        "--format",
        "best[ext=mp4]/best",
        "-g",
        cleanUrl,
      ];
      const { stdout } = await execFileAsync(ytdlp, args, { timeout: 15000 });
      const streamUrl = stdout.trim().split("\n")[0]?.trim();
      if (streamUrl && streamUrl.startsWith("http")) {
        const isHls = streamUrl.includes(".m3u8");
        return {
          streamUrl,
          contentType: isHls ? "application/x-mpegURL" : "video/mp4",
          provider: host.includes("youtube.com") || host.includes("youtu.be") ? "youtube" : "web",
          isHls,
        };
      }
    } catch (err) {
      console.warn(
        "[Stream Extractor] yt-dlp extraction failed for:",
        cleanUrl,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Fallback direct URL
  return {
    streamUrl: cleanUrl,
    contentType: "video/mp4",
    provider: "external",
    isHls: cleanUrl.includes(".m3u8"),
  };
}

// Generate self-contained HTML5 Player for <iframe> embeds (matches CatalogCard)
export function renderEmbeddedPlayer(
  mediaId: string,
  title: string,
  posterUrl: string | null,
  youtubeVideoId?: string | null,
): string {
  const safeTitle = title.replace(/["<>]/g, "");
  const streamEndpoint = `/api/stream/video/${encodeURIComponent(mediaId)}`;

  if (youtubeVideoId) {
    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - XoraTV Cinema</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background: #07090e;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .player-container {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
    }
    .iframe-wrapper {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      position: absolute;
      top: 0;
      left: 0;
    }
    /* Cinema Top Mask: gracefully covers YouTube video title, channel avatar, watch later and share icons */
    .cinema-top-mask {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 52px;
      background: linear-gradient(180deg, rgba(7, 9, 14, 0.96) 0%, rgba(7, 9, 14, 0.65) 65%, transparent 100%);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 20;
      pointer-events: none;
    }
    .cinema-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 70%;
      overflow: hidden;
    }
    .cinema-badge {
      background: rgba(220, 38, 38, 0.22);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.35);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
      text-transform: uppercase;
    }
    .cinema-title {
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }
    .cinema-stream-tag {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: #94a3b8;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 4px 10px;
      border-radius: 9999px;
      white-space: nowrap;
    }
    .dot {
      width: 6px;
      height: 6px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 8px #22c55e;
    }
    /* Bottom right watermark shield: covers YouTube logo watermark cleanly without blocking footage */
    .youtube-shield {
      position: absolute;
      bottom: 8px;
      right: 8px;
      z-index: 20;
      pointer-events: none;
      background: rgba(8, 10, 15, 0.94);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #f1f5f9;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      padding: 4px 10px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
      user-select: none;
      cursor: default;
    }
    .shield-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #ef4444;
      box-shadow: 0 0 6px #ef4444;
    }
  </style>
</head>
<body>
  <div class="player-container">
    <div class="cinema-top-mask">
      <div class="cinema-brand">
        <span class="cinema-badge">XORA CINEMA</span>
        <span class="cinema-title">${safeTitle}</span>
      </div>
      <div class="cinema-stream-tag">
        <span class="dot"></span> 4K ULTRA HD
      </div>
    </div>
    <div class="iframe-wrapper">
      <iframe
        id="ytPlayerFrame"
        src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeVideoId)}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&controls=1&enablejsapi=1"
        title="${safeTitle}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
      ></iframe>
    </div>
    <div class="youtube-shield">
      <span class="shield-dot"></span>
      <span>XORA CINEMA</span>
    </div>
  </div>
  <script>
    // Bridge postMessage commands from outer parent container down to inner YouTube iframe
    window.addEventListener('message', function(event) {
      try {
        const frame = document.getElementById('ytPlayerFrame');
        if (!frame || !frame.contentWindow) return;
        let data = event.data;
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
        if (data && (data.event === 'command' || data.type === 'xora_player_cmd')) {
          let ytFunc = 'playVideo';
          if (data.func) {
            ytFunc = data.func;
          } else if (data.action === 'pause') {
            ytFunc = 'pauseVideo';
          }
          frame.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: ytFunc,
            args: []
          }), '*');
        }
      } catch (e) {
        // Ignore parsing errors from other postMessages
      }
    });
  </script>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - XoraTV Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background: #090a0f;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .player-container {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      outline: none;
    }
    .badge {
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 9999px;
      pointer-events: none;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 6px;
      height: 6px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 8px #22c55e;
    }
    .error-card {
      display: none;
      text-align: center;
      padding: 24px;
      max-width: 400px;
      z-index: 20;
    }
    .error-card h3 { font-size: 16px; margin-bottom: 8px; color: #ef4444; }
    .error-card p { font-size: 13px; color: #94a3b8; line-height: 1.5; }
    .retry-btn {
      margin-top: 16px;
      background: #3b82f6;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
  <div class="player-container">
    <div class="badge"><span class="dot"></span>Xora Stream Proxy</div>
    <video
      id="xoraVideo"
      controls
      autoplay
      playsinline
      poster="${posterUrl ? posterUrl.replace(/["<>]/g, "") : ""}"
    ></video>
    <div id="errorCard" class="error-card">
      <h3>Stream Buffering Error</h3>
      <p id="errorMsg">The dynamic stream proxy is connecting to the content source. Please retry in a moment.</p>
      <button class="retry-btn" onclick="location.reload()">Retry Stream</button>
    </div>
  </div>

  <script>
    const video = document.getElementById('xoraVideo');
    const errorCard = document.getElementById('errorCard');
    const errorMsg = document.getElementById('errorMsg');
    const streamSrc = "${streamEndpoint}";

    function initPlayer() {
      // Check if source is HLS and browser doesn't natively support it
      if (Hls.isSupported() && streamSrc.includes('.m3u8')) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(streamSrc);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, function(event, data) {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                showError('Stream connection interrupted.');
                break;
            }
          }
        });
      } else {
        video.src = streamSrc;
      }
    }

    function showError(msg) {
      video.style.display = 'none';
      errorCard.style.display = 'block';
      if (msg) errorMsg.textContent = msg;
    }

    video.addEventListener('error', () => {
      const err = video.error;
      showError('Unable to load dynamic stream. Upstream source may be temporarily restricted or offline.');
    });

    // Support postMessage play/pause from parent
    window.addEventListener('message', function(event) {
      try {
        let data = event.data;
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
        if (data && (data.event === 'command' || data.type === 'xora_player_cmd')) {
          if (data.func === 'playVideo' || data.action === 'play') {
            video.play().catch(function() {});
          } else if (data.func === 'pauseVideo' || data.action === 'pause') {
            video.pause();
          }
        }
      } catch (e) {}
    });

    initPlayer();
  </script>
</body>
</html>`;
}

// Main HTTP stream proxy handler
export async function handleStreamProxyRoute(request: Request, url: URL): Promise<Response | null> {
  const pathname = url.pathname;

  // 1. Embed route for <iframe> playback: /api/stream/embed/:id
  const embedMatch = pathname.match(/^\/api\/stream\/embed\/([^/]+)$/);
  if (embedMatch && request.method === "GET") {
    const rawId = decodeURIComponent(embedMatch[1]);
    let title = "XoraTV Stream";
    let posterUrl: string | null = null;
    let youtubeVideoId: string | null = null;

    try {
      const item =
        (await xseriesDbRead(`mediaItems/${rawId}`)) ||
        (await xseriesDbRead(`candidates/${rawId}`));
      if (item) {
        title = item.title || title;
        posterUrl = item.thumbnail_url || null;
        if (item.source_provider === "youtube" && item.source_id) {
          youtubeVideoId = item.source_id;
        } else if (item.source_url) {
          try {
            const u = new URL(item.source_url);
            youtubeVideoId = extractYouTubeId(u);
          } catch (e) {
            void e;
          }
        }
      }
    } catch (e) {
      void e;
    }

    const html = renderEmbeddedPlayer(rawId, title, posterUrl, youtubeVideoId);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "SAMEORIGIN",
        "Cache-Control": "no-cache",
      },
    });
  }

  // 2. Video stream proxy route: /api/stream/video/:id or /api/stream/video?url=...
  const videoMatch = pathname.match(/^\/api\/stream\/video\/([^/]+)$/);
  if ((videoMatch || pathname === "/api/stream/video") && request.method === "GET") {
    const id = videoMatch ? decodeURIComponent(videoMatch[1]) : url.searchParams.get("id");
    let targetUrl = url.searchParams.get("url");
    let providerHint: string | undefined;

    // Resolve target URL from database if ID is provided
    if (id && !targetUrl) {
      try {
        const item =
          (await xseriesDbRead(`mediaItems/${id}`)) || (await xseriesDbRead(`candidates/${id}`));
        if (item) {
          targetUrl = item.playback?.url || item.source_url;
          providerHint = item.source_provider || item.playback?.provider;
        }
      } catch (err) {
        console.warn("[Stream Proxy] Error looking up item:", err);
      }
    }

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ ok: false, error: "Stream target URL or ID is required." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      // Resolve dynamic stream URL
      const streamInfo = await extractStreamUrl(targetUrl, providerHint);
      const cacheKey = hashKey(streamInfo.streamUrl);
      const { metaFile, dataFile } = getCachePaths(cacheKey);

      // Check if Range header is present
      const rangeHeader = request.headers.get("range");

      // Check temporary cache
      const hasCachedFile = fs.existsSync(dataFile) && fs.existsSync(metaFile);

      if (hasCachedFile) {
        try {
          const stats = fs.statSync(dataFile);
          const totalSize = stats.size;

          // Touch lastAccessedAt and extend TTL by 30 mins
          const metaRaw = fs.readFileSync(metaFile, "utf-8");
          const meta: CacheMetadata = JSON.parse(metaRaw);
          meta.lastAccessedAt = Date.now();
          meta.expiresAt = Date.now() + CACHE_TTL_MS;
          fs.writeFileSync(metaFile, JSON.stringify(meta));
          cacheIndex.set(cacheKey, meta);

          if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10) || 0;
            const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
            const chunkSize = end - start + 1;

            const stream = fs.createReadStream(dataFile, { start, end });
            const webStream = Readable.toWeb(stream) as ReadableStream;
            return new Response(webStream, {
              status: 206,
              headers: {
                "Content-Range": `bytes ${start}-${end}/${totalSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": String(chunkSize),
                "Content-Type": meta.contentType || "video/mp4",
                "Cache-Control": "public, max-age=1800",
                "Access-Control-Allow-Origin": "*",
              },
            });
          }

          // Return full cached file
          const stream = fs.createReadStream(dataFile);
          const webStream = Readable.toWeb(stream) as ReadableStream;
          return new Response(webStream, {
            status: 200,
            headers: {
              "Content-Length": String(totalSize),
              "Accept-Ranges": "bytes",
              "Content-Type": meta.contentType || "video/mp4",
              "Cache-Control": "public, max-age=1800",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (e) {
          console.warn("[Stream Proxy] Cache read failed, fetching upstream:", e);
        }
      }

      // Upstream proxy fetch
      const upstreamHeaders: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: targetUrl,
        Accept: "*/*",
      };
      if (rangeHeader) {
        upstreamHeaders.Range = rangeHeader;
      }

      const upstreamRes = await fetch(streamInfo.streamUrl, {
        headers: upstreamHeaders,
        signal: request.signal,
      });

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Upstream stream server returned HTTP ${upstreamRes.status}`,
          }),
          {
            status: upstreamRes.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const responseHeaders = new Headers();
      responseHeaders.set(
        "Content-Type",
        streamInfo.contentType || upstreamRes.headers.get("content-type") || "video/mp4",
      );
      responseHeaders.set("Accept-Ranges", "bytes");
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Cache-Control", "public, max-age=1800");

      if (upstreamRes.headers.get("content-length")) {
        responseHeaders.set("Content-Length", upstreamRes.headers.get("content-length")!);
      }
      if (upstreamRes.headers.get("content-range")) {
        responseHeaders.set("Content-Range", upstreamRes.headers.get("content-range")!);
      }

      // If full stream and not already cached, tee chunks into temporary cache
      if (!rangeHeader && upstreamRes.status === 200 && upstreamRes.body) {
        const contentLength = Number(upstreamRes.headers.get("content-length") || 0);

        // Only cache if reasonable size (< 250 MB)
        if (contentLength > 0 && contentLength < 250 * 1024 * 1024) {
          const writeStream = fs.createWriteStream(dataFile);
          const meta: CacheMetadata = {
            key: cacheKey,
            sourceUrl: streamInfo.streamUrl,
            contentType: streamInfo.contentType,
            contentLength,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            expiresAt: Date.now() + CACHE_TTL_MS,
            complete: false,
          };

          const [clientStream, cacheStream] = upstreamRes.body.tee();

          (async () => {
            try {
              const reader = cacheStream.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) writeStream.write(value);
              }
              writeStream.end();
              meta.complete = true;
              fs.writeFileSync(metaFile, JSON.stringify(meta));
              cacheIndex.set(cacheKey, meta);
            } catch (_streamErr) {
              try {
                writeStream.destroy();
                if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
              } catch (_cleanupErr) {
                // Ignore cleanup error
              }
            }
          })();

          return new Response(clientStream, {
            status: 200,
            headers: responseHeaders,
          });
        }
      }

      // Forward stream directly
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    } catch (err) {
      console.warn(
        "[Stream Proxy] Proxy streaming failed:",
        err instanceof Error ? err.message : err,
      );
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Stream proxy encountered a transmission error.",
          details: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // 3. Cache purge endpoint: POST /api/stream/cache/purge
  if (pathname === "/api/stream/cache/purge" && request.method === "POST") {
    const result = cleanExpiredStreamCache();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}
