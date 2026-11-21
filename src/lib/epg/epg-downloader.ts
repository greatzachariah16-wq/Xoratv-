export type EpgDownloadResult = {
  response: Response;
  unchanged: boolean;
  etag?: string;
  lastModified?: string;
};

export type EpgDownloadOptions = {
  url: string;
  proxyUrl?: string;
  etag?: string;
  lastModified?: string;
  force?: boolean;
  signal?: AbortSignal;
};

/**
 * EPG is fetched through Xora's same-origin streaming endpoint. This avoids
 * WebView CORS and keeps the XML body streaming instead of materialising a
 * 50–300 MB response as a JavaScript string.
 */
export async function downloadEpg(options: EpgDownloadOptions): Promise<EpgDownloadResult> {
  const source = new URL(options.url);
  if (source.protocol !== "https:" && source.protocol !== "http:") {
    throw new Error("EPG URL must use HTTP or HTTPS.");
  }
  const endpoint = new URL("/api/tv/epg-source", window.location.origin);
  endpoint.searchParams.set("url", source.toString());
  if (options.proxyUrl) endpoint.searchParams.set("proxy", options.proxyUrl);

  const headers = new Headers();
  if (!options.force && options.etag) headers.set("If-None-Match", options.etag);
  if (!options.force && options.lastModified) headers.set("If-Modified-Since", options.lastModified);

  const response = await fetch(endpoint, { method: "GET", headers, cache: "no-store", signal: options.signal });
  if (response.status === 304) {
    return { response, unchanged: true, etag: options.etag, lastModified: options.lastModified };
  }
  if (!response.ok || !response.body) {
    throw new Error("EPG download failed (HTTP " + response.status + ").");
  }
  return {
    response,
    unchanged: false,
    etag: response.headers.get("ETag") || undefined,
    lastModified: response.headers.get("Last-Modified") || undefined,
  };
}
