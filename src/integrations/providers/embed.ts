/**
 * Official embed and watch URL resolver for video providers (YouTube, Vimeo, Dailymotion).
 * Enforces official embedded player URLs with safe defaults (nocookie, dnt, autoplay=0).
 */

export interface EmbedInfo {
  provider: "youtube" | "vimeo" | "dailymotion" | "custom";
  videoId: string | null;
  embedUrl: string;
}

/**
 * Parses a stream/watch/embed URL and returns normalized embed info.
 */
export function parseEmbedInfo(
  urlOrId: string | null | undefined,
  source?: string | null,
): EmbedInfo | null {
  if (!urlOrId) return null;
  const input = urlOrId.trim();

  // 1. YouTube
  if (
    source === "youtube" ||
    input.includes("youtube.com") ||
    input.includes("youtu.be") ||
    input.startsWith("yt-")
  ) {
    let videoId: string | null = null;
    if (input.startsWith("yt-")) {
      videoId = input.slice(3);
    } else {
      const match =
        input.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/) ||
        input.match(/[?&]v=([\w-]{11})/);
      videoId = match ? match[1] : null;
    }

    if (videoId) {
      return {
        provider: "youtube",
        videoId,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`,
      };
    }
  }

  // 2. Vimeo
  if (source === "vimeo" || input.includes("vimeo.com") || input.startsWith("vimeo-")) {
    let videoId: string | null = null;
    if (input.startsWith("vimeo-")) {
      videoId = input.slice(6);
    } else {
      const match = input.match(/(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/);
      videoId = match ? match[1] : null;
    }

    if (videoId) {
      return {
        provider: "vimeo",
        videoId,
        embedUrl: `https://player.vimeo.com/video/${videoId}?dnt=1`,
      };
    }
  }

  // 3. Dailymotion
  if (
    source === "dailymotion" ||
    input.includes("dailymotion.com") ||
    input.includes("dai.ly") ||
    input.startsWith("dm-")
  ) {
    let videoId: string | null = null;
    if (input.startsWith("dm-")) {
      videoId = input.slice(3);
    } else {
      const match = input.match(
        /(?:dailymotion\.com\/(?:video\/|embed\/video\/)|dai\.ly\/)([a-zA-Z0-9]+)/,
      );
      videoId = match ? match[1] : null;
    }

    if (videoId) {
      return {
        provider: "dailymotion",
        videoId,
        embedUrl: `https://www.dailymotion.com/embed/video/${videoId}?autoplay=0`,
      };
    }
  }

  return null;
}
