import { downloadEpg, readEpgTextChunks, removeDownloadedEpg } from "./epg-downloader";
import { matchEpgChannels } from "./epg-matcher";
import type { M3uChannel } from "./m3u-parser";
import { parseXmltv } from "./epg-parser";
import {
  clearEpgData, deleteExpiredProgrammes, getEpgChannels, getMappings, getMeta, getProgrammesForChannel,
  getProgrammesForChannels, putChannels, putProgrammes, saveManualMapping, saveMappings, setMeta,
  type EpgProgramme,
} from "./epg-store";

const SIX_HOURS = 6 * 60 * 60 * 1000;
let sourceUrl = "";
let proxyUrl = "";
let channels: M3uChannel[] = [];
let unmatchedChannels: M3uChannel[] = [];
let refreshTask: Promise<{ unchanged: boolean; channelCount: number; programmeCount: number; unmatchedCount: number }> | null = null;

export function configureEpg(options: { channels: M3uChannel[]; epgUrl?: string; proxyUrl?: string }): void {
  channels = options.channels || [];
  sourceUrl = options.epgUrl || "";
  proxyUrl = options.proxyUrl || "";
}

export async function refreshEpg(options: { force?: boolean } = {}) {
  if (refreshTask) return refreshTask;
  refreshTask = (async () => {
    if (!sourceUrl) throw new Error("No XMLTV URL was found in the M3U header. Configure VITE_XORA_EPG_URL to supply one manually.");
    const previous = await getMeta<{ url?: string; etag?: string; lastModified?: string }>("source");
    const sameSource = previous?.url === sourceUrl;
    const downloaded = await downloadEpg({
      url: sourceUrl,
      proxyUrl,
      etag: sameSource ? previous?.etag : undefined,
      lastModified: sameSource ? previous?.lastModified : undefined,
      force: options.force,
    });
    if (downloaded.status === "not-modified") {
      await deleteExpiredProgrammes();
      await setMeta("lastRefreshAt", Date.now());
      return { unchanged: true, channelCount: 0, programmeCount: 0, unmatchedCount: unmatchedChannels.length };
    }

    if (previous?.url && !sameSource) await clearEpgData();

    let channelBatch: Array<{ id: string; displayName?: string; logo?: string }> = [];
    let programmeBatch: EpgProgramme[] = [];
    const stats = await parseXmltv(readEpgTextChunks(downloaded), {
      onChannels: async (items) => {
        channelBatch.push(...items);
        if (channelBatch.length >= 250) {
          await putChannels(channelBatch);
          channelBatch = [];
        }
      },
      onProgrammes: async (items) => {
        programmeBatch.push(...items);
        if (programmeBatch.length >= 300) {
          await putProgrammes(programmeBatch);
          programmeBatch = [];
        }
      },
    });
    if (channelBatch.length) await putChannels(channelBatch);
    if (programmeBatch.length) await putProgrammes(programmeBatch);

    const epgChannels = await getEpgChannels();
    const existingMappings = await getMappings();
    const matched = matchEpgChannels(channels, epgChannels, existingMappings);
    await saveMappings(matched.mappings);
    unmatchedChannels = matched.unmatched;
    await setMeta("unmatchedChannels", unmatchedChannels);
    await deleteExpiredProgrammes();
    await setMeta("source", {
      url: sourceUrl,
      etag: downloaded.etag,
      lastModified: downloaded.lastModified,
      finalUrl: downloaded.finalUrl,
      updatedAt: Date.now(),
      channelCount: stats.channelCount,
      programmeCount: stats.programmeCount,
      malformedCount: stats.malformedCount,
    });
    await setMeta("lastRefreshAt", Date.now());
    await removeDownloadedEpg(downloaded);
    return {
      unchanged: false,
      channelCount: stats.channelCount,
      programmeCount: stats.programmeCount,
      unmatchedCount: unmatchedChannels.length,
    };
  })().finally(() => { refreshTask = null; });
  return refreshTask;
}

async function mappedChannelId(channelId: string): Promise<string> {
  const mappings = await getMappings();
  return mappings[channelId] || channelId;
}

export async function getNowAndNext(channelId: string): Promise<{ now: EpgProgramme | null; next: EpgProgramme | null }> {
  const now = Date.now();
  const items = await getProgrammesForChannel(await mappedChannelId(channelId), now + 48 * 3600000);
  const current = items.filter((item) => item.start <= now && item.stop > now).sort((a, b) => b.start - a.start)[0] || null;
  const next = items.filter((item) => item.start > now && (!current || item.start >= current.stop)).sort((a, b) => a.start - b.start)[0] || null;
  return { now: current, next };
}

export async function getDayGuide(channelId: string, date: Date | string): Promise<EpgProgramme[]> {
  const day = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  const id = await mappedChannelId(channelId);
  const items = await getProgrammesForChannel(id, end);
  return items.filter((item) => item.stop > start && item.start < end).sort((a, b) => a.start - b.start);
}

export async function getGridWindow(channelIds: string[], startTime: number, endTime: number): Promise<EpgProgramme[]> {
  const mappings = await getMappings();
  const mapped = channelIds.map((id) => mappings[id] || id);
  const reverse = new Map<string, string>();
  channelIds.forEach((id, index) => reverse.set(mapped[index], id));
  const programmes = await getProgrammesForChannels(mapped, startTime, endTime);
  return programmes.map((item) => ({ ...item, channelId: reverse.get(item.channelId) || item.channelId }));
}

export function getProgress(programme: Pick<EpgProgramme, "start" | "stop">, now = Date.now()): number {
  const duration = programme.stop - programme.start;
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(100, ((now - programme.start) / duration) * 100));
}

export function getUnmatchedChannels(): M3uChannel[] {
  return [...unmatchedChannels];
}

export async function getEpgUnmatchedChannels(): Promise<M3uChannel[]> {
  if (unmatchedChannels.length) return [...unmatchedChannels];
  return (await getMeta<M3uChannel[]>("unmatchedChannels")) || [];
}

export async function getAvailableEpgChannels() {
  return getEpgChannels();
}

export async function mapChannelManually(channelId: string, epgChannelId: string): Promise<void> {
  await saveManualMapping(channelId, epgChannelId);
  const current = await getMappings();
  current[channelId] = epgChannelId;
  await saveMappings(current);
  unmatchedChannels = unmatchedChannels.filter((item) => item.id !== channelId);
  await setMeta("unmatchedChannels", unmatchedChannels);
}

export function startEpgAutoRefresh(options: { channels: M3uChannel[]; epgUrl?: string; proxyUrl?: string }): () => void {
  configureEpg(options);
  let running = false;
  const run = async () => {
    if (running || !navigator.onLine) return;
    running = true;
    try {
      const last = await getMeta<number>("lastRefreshAt");
      if (!last || Date.now() - last >= SIX_HOURS) await refreshEpg();
    } catch (error) {
      console.warn("[Xora EPG] Refresh failed:", error);
    } finally { running = false; }
  };
  void run();
  const interval = window.setInterval(run, SIX_HOURS);
  const onVisible = () => { if (document.visibilityState === "visible") void run(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", onVisible);
  };
}
