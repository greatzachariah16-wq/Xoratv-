import type { ProviderCandidate, ProviderSearchParams } from "./types";

interface VimeoRawItem {
  uri: string;
  name: string;
  description?: string | null;
  link?: string;
  duration?: number;
  created_time?: string;
  release_time?: string;
  player_embed_url?: string;
  pictures?: {
    sizes?: Array<{ link: string; width: number }>;
    base_link?: string;
  };
  user?: { name?: string };
}

function formatVimeoItem(item: VimeoRawItem): ProviderCandidate | null {
  // uri format: "/videos/123456789"
  const videoIdMatch = item.uri?.match(/\/videos\/(\d+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : null;
  if (!videoId) return null;

  const largestPic =
    item.pictures?.sizes && item.pictures.sizes.length > 0
      ? item.pictures.sizes[item.pictures.sizes.length - 1].link
      : item.pictures?.base_link || null;

  return {
    id: `vimeo-${videoId}`,
    provider: "vimeo",
    title: item.name || "Untitled Vimeo Video",
    description: item.description || null,
    thumbnailUrl: largestPic,
    embedUrl: item.player_embed_url || `https://player.vimeo.com/video/${videoId}?dnt=1`,
    watchUrl: item.link || `https://vimeo.com/${videoId}`,
    durationSeconds: typeof item.duration === "number" ? item.duration : null,
    channelName: item.user?.name || null,
    publishedAt: item.release_time || item.created_time || null,
  };
}

export function getVimeoTokens(): string[] {
  const tokens: string[] = [];

  const add = (tok?: string | null) => {
    if (tok && typeof tok === "string") {
      const clean = tok.trim();
      if (clean && !tokens.includes(clean)) {
        tokens.push(clean);
      }
    }
  };

  if (typeof process !== "undefined" && process.env) {
    add(process.env.VIMEO_ACCESS_TOKEN);
    add(process.env.VITE_VIMEO_ACCESS_TOKEN);
    add(process.env.VIMEO_ACCESS_TOKEN_2);
    add(process.env.VIMEO_PRIVATE_ACCESS_TOKEN);
    if (process.env.VIMEO_ACCESS_TOKENS) {
      process.env.VIMEO_ACCESS_TOKENS.split(",").forEach(add);
    }
  }

  if (typeof import.meta !== "undefined" && import.meta.env) {
    add(import.meta.env.VIMEO_ACCESS_TOKEN);
    add(import.meta.env.VITE_VIMEO_ACCESS_TOKEN);
  }

  // Active default token fallback
  add("72988b4dd4eb3faa1c86ef839aacc4c1");

  return tokens;
}

export async function executeVimeoApiSearch(params: ProviderSearchParams): Promise<{
  ok: boolean;
  count: number;
  candidates: ProviderCandidate[];
  error?: string;
}> {
  const tokens = getVimeoTokens();

  if (tokens.length === 0) {
    return {
      ok: false,
      count: 0,
      candidates: [],
      error:
        "Vimeo access token not configured (set VIMEO_ACCESS_TOKEN, VITE_VIMEO_ACCESS_TOKEN, or VIMEO_ACCESS_TOKENS)",
    };
  }

  const query = params.query.trim();
  if (!query) {
    return { ok: true, count: 0, candidates: [] };
  }
  const limit = Math.min(params.limit || 10, 25);

  let lastError = "All Vimeo tokens failed";

  for (let i = 0; i < tokens.length; i++) {
    const cleanToken = tokens[i];
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cleanToken}`,
      Accept: "application/vnd.vimeo.*+json;version=3.4",
    };

    // Direct video ID or Vimeo URL lookup support
    const directIdMatch = query.match(
      /(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/|^vimeo-|^)(\d{5,15})/i,
    );
    const directId = directIdMatch ? directIdMatch[1] : null;

    if (directId) {
      try {
        const directRes = await fetch(`https://api.vimeo.com/videos/${directId}`, { headers });
        if (directRes.ok) {
          const item = (await directRes.json()) as VimeoRawItem;
          const candidate = formatVimeoItem(item);
          if (candidate) {
            return { ok: true, count: 1, candidates: [candidate] };
          }
        } else if (directRes.status === 401 || directRes.status === 403) {
          console.warn(
            `[Vimeo Provider] Token index ${i} failed direct lookup with HTTP ${directRes.status}. Retrying next token...`,
          );
          lastError = `HTTP ${directRes.status}: Unauthorized/Forbidden token`;
          continue;
        }
      } catch {
        // Fall through to query search if direct lookup fails
      }
    }

    const searchUrl = `https://api.vimeo.com/videos?query=${encodeURIComponent(query)}&per_page=${limit}`;

    try {
      const res = await fetch(searchUrl, { headers });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        let errorMsg = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(errBody);
          if (parsed?.error) {
            if (
              parsed.error.includes("restricted in your region") ||
              parsed.developer_message?.includes("restricted in") ||
              parsed.error_code === 5451
            ) {
              errorMsg =
                "Vimeo general search is region-restricted by Vimeo on cloud servers. Paste direct Vimeo URLs or Video IDs into search to import.";
            } else {
              errorMsg = `HTTP ${res.status}: ${parsed.error}`;
            }
          }
        } catch {
          if (errBody) errorMsg = `HTTP ${res.status}: ${errBody.slice(0, 80)}`;
        }

        lastError = errorMsg;

        if (res.status === 401 || res.status === 403) {
          console.warn(
            `[Vimeo Provider] Token index ${i} rejected (${errorMsg}). Retrying next token...`,
          );
          continue;
        }

        return { ok: false, count: 0, candidates: [], error: errorMsg };
      }

      const data = await res.json();
      const items = (data.data || []) as VimeoRawItem[];

      const minDuration =
        typeof params.minDurationSeconds === "number"
          ? params.minDurationSeconds
          : params.feed === "shorts"
            ? 0
            : 2400; // Default 40 minutes (2400s) for movie searches

      const candidates = items
        .map((item) => formatVimeoItem(item))
        .filter((item): item is ProviderCandidate => {
          if (!item) return false;
          if (
            minDuration > 0 &&
            typeof item.durationSeconds === "number" &&
            item.durationSeconds < minDuration
          ) {
            return false;
          }
          return true;
        });

      return { ok: true, count: candidates.length, candidates };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      lastError = msg;
      console.warn(
        `[Vimeo Provider] Token index ${i} execution error: ${msg}. Trying next token if available...`,
      );
    }
  }

  return { ok: false, count: 0, candidates: [], error: lastError };
}

export async function searchVimeoWithStatus(params: ProviderSearchParams): Promise<{
  ok: boolean;
  count: number;
  candidates: ProviderCandidate[];
  error?: string;
}> {
  // If running in browser environment, try the backend API endpoint to keep keys server-side
  if (typeof window !== "undefined") {
    try {
      const searchParams = new URLSearchParams({
        q: params.query,
        limit: String(params.limit || 10),
      });
      if (params.feed) {
        searchParams.set("feed", params.feed);
      }
      if (typeof params.minDurationSeconds === "number") {
        searchParams.set("minDurationSeconds", String(params.minDurationSeconds));
      }

      const res = await fetch(`/api/vimeo/search?${searchParams.toString()}`);
      const data = (await res.json().catch(() => null)) as {
        ok: boolean;
        count: number;
        candidates: ProviderCandidate[];
        error?: string;
      } | null;

      if (data && typeof data.ok === "boolean") {
        return data;
      }
    } catch {
      // Fall through to direct execution
    }
  }

  // Direct execution (server runtime or fallback)
  return executeVimeoApiSearch(params);
}

export async function searchVimeo(params: ProviderSearchParams): Promise<ProviderCandidate[]> {
  const res = await searchVimeoWithStatus(params);
  return res.candidates;
}
