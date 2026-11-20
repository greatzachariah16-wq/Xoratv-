import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeDownloadResult = {
  status: "downloaded" | "not-modified";
  fileName?: string;
  etag?: string;
  lastModified?: string;
  bytes?: number;
  finalUrl?: string;
  contentType?: string;
};

type NativeEpgPlugin = {
  download(options: { url: string; proxyUrl?: string; etag?: string; lastModified?: string; force?: boolean }): Promise<NativeDownloadResult>;
  readChunk(options: { fileName: string; offset: number; length: number }): Promise<{ data: string; bytes: number }>;
  deleteFile(options: { fileName: string }): Promise<void>;
};

const NativeEpg = registerPlugin<NativeEpgPlugin>("XoraEpg");
const CHUNK_SIZE = 48 * 1024;

export type EpgDownload = {
  status: "downloaded" | "not-modified";
  nativeFileName?: string;
  response?: Response;
  etag?: string;
  lastModified?: string;
  finalUrl?: string;
};

function proxyTarget(url: string, proxyUrl?: string): string | undefined {
  if (!proxyUrl) return undefined;
  if (proxyUrl.includes("{url}")) return proxyUrl.replace("{url}", encodeURIComponent(url));
  return proxyUrl + (proxyUrl.includes("?") ? "&" : "?") + "url=" + encodeURIComponent(url);
}

export async function downloadEpg(options: {
  url: string;
  proxyUrl?: string;
  etag?: string;
  lastModified?: string;
  force?: boolean;
}): Promise<EpgDownload> {
  if (!options.url) throw new Error("No XMLTV EPG URL is configured.");
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const result = await NativeEpg.download({
      url: options.url,
      proxyUrl: proxyTarget(options.url, options.proxyUrl),
      etag: options.force ? undefined : options.etag,
      lastModified: options.force ? undefined : options.lastModified,
      force: options.force,
    });
    return {
      status: result.status,
      nativeFileName: result.fileName,
      etag: result.etag,
      lastModified: result.lastModified,
      finalUrl: result.finalUrl,
    };
  }

  const urls = [options.url, proxyTarget(options.url, options.proxyUrl)].filter((value): value is string => Boolean(value));
  let lastError: unknown;
  for (const url of urls) {
    try {
      const headers = new Headers({ Accept: "application/xml,text/xml,application/gzip,*/*;q=0.8" });
      if (!options.force && options.etag) headers.set("If-None-Match", options.etag);
      if (!options.force && options.lastModified) headers.set("If-Modified-Since", options.lastModified);
      const response = await fetch(url, { method: "GET", headers, redirect: "follow", cache: "no-store" });
      if (response.status === 304) return { status: "not-modified", etag: options.etag, lastModified: options.lastModified, finalUrl: response.url };
      if (!response.ok || !response.body) throw new Error("EPG download failed: HTTP " + response.status);
      return {
        status: "downloaded",
        response,
        etag: response.headers.get("etag") || undefined,
        lastModified: response.headers.get("last-modified") || undefined,
        finalUrl: response.url,
      };
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to download XMLTV.");
}

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function* readEpgTextChunks(download: EpgDownload): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8");
  if (download.nativeFileName) {
    let offset = 0;
    while (true) {
      const result = await NativeEpg.readChunk({ fileName: download.nativeFileName, offset, length: CHUNK_SIZE });
      if (!result.bytes) break;
      offset += result.bytes;
      yield decoder.decode(base64Bytes(result.data), { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
    return;
  }
  if (!download.response?.body) throw new Error("The downloaded EPG file is unavailable.");
  let stream: ReadableStream<Uint8Array> = download.response.body;
  const contentType = download.response.headers.get("content-type") || "";
  const contentEncoding = download.response.headers.get("content-encoding") || "";
  const isGzip = !/gzip/i.test(contentEncoding) && (/\.gz(?:$|[?#])/i.test(download.finalUrl || "") || /application\/gzip|application\/x-gzip/i.test(contentType));
  if (isGzip) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress gzip XMLTV streams.");
    stream = stream.pipeThrough(new DecompressionStream("gzip"));
  }
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally { reader.releaseLock(); }
}

export async function removeDownloadedEpg(download: EpgDownload): Promise<void> {
  if (download.nativeFileName) await NativeEpg.deleteFile({ fileName: download.nativeFileName }).catch(() => {});
}
