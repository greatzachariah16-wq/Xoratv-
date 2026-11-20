import { downloadEpg } from "./epg-downloader";
import { parseXmltvStream } from "./epg-parser";
import {
  clearEpgContent, deleteExpiredProgrammes, getManualMappings, getMeta, getProgrammes,
  saveChannels, setMeta, setManualMapping, writeProgrammeBatch,
  type EpgChannel, type EpgProgramme,
} from "./epg-store";
import { matchEpgChannels, type MatchableChannel } from "./epg-matcher";

export type EpgRefreshOptions = { force?: boolean; url?: string; proxyUrl?: string; channels?: MatchableChannel[] };
let refreshTask: Promise<{ unchanged: boolean; count: number }> | null = null;

export async function refreshEpg(options: EpgRefreshOptions = {}) {
  if (refreshTask && !options.force) return refreshTask;
  const task = (async () => {
    const url = options.url || await getMeta<string>("epgUrl");
    if (!url) throw new Error("No XMLTV URL configured. Add an EPG URL in Live TV settings.");
    const etag = await getMeta<string>("epgEtag");
    const lastModified = await getMeta<string>("epgLastModified");
    const result = await downloadEpg({ url, proxyUrl: options.proxyUrl || await getMeta<string>("epgProxyUrl"), etag, lastModified, force: options.force });
    if (result.unchanged) {
      await setMeta("epgLastCheckedAt", Date.now());
      return { unchanged: true, count: 0 };
    }
    const response = result.response;
    const isGzip = /\\.gz(?:$|[?#])/i.test(url) || response.headers.get("X-EPG-Gzip") === "1";
    let count = 0;
    if (!response.body) throw new Error("EPG source returned no readable stream.");
    for await (const batch of parseXmltvStream(response.body, {
      gzip: isGzip,
      onChannels: async (channels) => { await saveChannels(channels); },
    })) {
      await writeProgrammeBatch(batch);
      count += batch.length;
    }
    await deleteExpiredProgrammes();
    const currentChannels = await getMeta<MatchableChannel[]>("liveChannels");
    if (currentChannels?.length) await syncEpgChannels(currentChannels);
    if (result.etag) await setMeta("epgEtag", result.etag);
    if (result.lastModified) await setMeta("epgLastModified", result.lastModified);
    await setMeta("epgUrl", url);
    await setMeta("epgLastUpdatedAt", Date.now());
    return { unchanged: false, count };
  })();
  refreshTask = task;
  try { return await task; } finally { if (refreshTask === task) refreshTask = null; }
}

export async function configureEpg(url: string, proxyUrl?: string) {
  const previousUrl = await getMeta<string>("epgUrl");
  if (previousUrl && previousUrl !== url.trim()) {
    await clearEpgContent();
    await setMeta("epgEtag", "");
    await setMeta("epgLastModified", "");
  }
  await setMeta("epgUrl", url.trim());
  if (proxyUrl) await setMeta("epgProxyUrl", proxyUrl.trim());
  else await setMeta("epgProxyUrl", "");
}

export async function getEpgSettings() {
  return {
    url: (await getMeta<string>("epgUrl")) || "",
    proxyUrl: (await getMeta<string>("epgProxyUrl")) || "",
  };
}

export async function syncEpgChannels(channels: MatchableChannel[]) {
  await setMeta("liveChannels", channels);
  const epgChannels = await getAllEpgChannels();
  await saveChannels(epgChannels);
  const overrides = await getManualMappings();
  const result = matchEpgChannels(channels, epgChannels, overrides);
  await setMeta("channelMatches", result.matches);
  await setMeta("unmatchedChannels", result.unmatched);
  return result;
}

async function getAllEpgChannels(): Promise<EpgChannel[]> {
  const { getAllChannels } = await import("./epg-store");
  return getAllChannels();
}

export async function saveXmltvChannels(channels: EpgChannel[]) {
  await saveChannels(channels);
}

export async function getEpgMappingOptions() {
  return {
    unmatched: (await getMeta<MatchableChannel[]>("unmatchedChannels")) || [],
    epgChannels: await getAllEpgChannels(),
  };
}

export async function setEpgChannelMapping(channelId: string, epgId: string) {
  await setManualMapping(channelId, epgId);
  const channels = await getMeta<MatchableChannel[]>("liveChannels");
  if (channels?.length) await syncEpgChannels(channels);
}

export async function getNowAndNext(channelId: string) {
  const now = Date.now();
  const matches = (await getMeta<Record<string,string>>("channelMatches")) || {};
  const epgId = matches[channelId] || channelId;
  const programmes = await getProgrammes(epgId, now - 2 * 60 * 60_000, now + 48 * 60 * 60_000);
  return { now: programmes.find((item) => item.start <= now && item.stop > now) || null,
    next: programmes.find((item) => item.start > now) || null };
}

export async function getDayGuide(channelId: string, date: Date | string) {
  const day = typeof date === "string"
    ? (() => { const [year, month, dayOfMonth] = date.split("-").map(Number); return new Date(year, month - 1, dayOfMonth); })()
    : date;
  const startDate = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const nextDate = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const start = startDate.getTime();
  const stop = nextDate.getTime();
  const matches = (await getMeta<Record<string,string>>("channelMatches")) || {};
  return getProgrammes(matches[channelId] || channelId, start, stop);
}

export async function getGridWindow(channelIds: string[], startTime: number, endTime: number) {
  const matches = (await getMeta<Record<string,string>>("channelMatches")) || {};
  const result = await Promise.all(channelIds.map(async (channelId) => ({
    channelId, programmes: await getProgrammes(matches[channelId] || channelId, startTime, endTime),
  })));
  return result;
}

export function getProgress(programme: Pick<EpgProgramme, "start" | "stop">, now = Date.now()) {
  if (programme.stop <= programme.start) return 0;
  return Math.max(0, Math.min(100, ((now - programme.start) / (programme.stop - programme.start)) * 100));
}

export function startEpgRefreshScheduler() {
  let running = false;
  const run = () => {
    if (running || document.visibilityState === "hidden") return;
    running = true;
    void refreshEpg().catch((error) => console.warn("[Xora EPG] Refresh failed", error)).finally(() => { running = false; });
  };
  const timer = window.setInterval(run, 6 * 60 * 60_000);
  const onResume = () => { if (document.visibilityState === "visible") run(); };
  document.addEventListener("visibilitychange", onResume);
  window.addEventListener("focus", onResume);
  return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onResume); window.removeEventListener("focus", onResume); };
}
