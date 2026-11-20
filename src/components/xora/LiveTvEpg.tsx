import { useMemo, useState } from "react";
import "@/styles/tv-epg.css";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, Grid3X3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAvailableEpgChannels, getDayGuide, getEpgUnmatchedChannels, getGridWindow, getNowAndNext, getProgress, mapChannelManually, refreshEpg } from "@/lib/epg/epg-api";
import type { EpgProgramme } from "@/lib/epg/epg-store";

type EpgChannelRef = { id: string; name: string; logo?: string; country?: string };

function timeLabel(value: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function ChannelNowNext({ channelId }: { channelId: string }) {
  const query = useQuery({
    queryKey: ["xora-epg-now-next", channelId],
    queryFn: () => getNowAndNext(channelId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const current = query.data?.now;
  const next = query.data?.next;
  if (query.isLoading) return <span className="xora-epg-row-line">Loading guide…</span>;
  if (!current && !next) return <span className="xora-epg-row-line">No guide data</span>;
  return (
    <span className="xora-epg-row-guide">
      <span className="xora-epg-row-line">{current ? "NOW · " + current.title : "NEXT · " + next?.title}</span>
      {current ? <span className="xora-epg-row-progress"><i style={{ width: getProgress(current) + "%" }} /></span> : null}
      {current && next ? <span className="xora-epg-row-next">Next: {next.title}</span> : null}
    </span>
  );
}

function ProgrammeCard({ programme, now }: { programme: EpgProgramme; now?: boolean }) {
  const progress = now ? getProgress(programme) : 0;
  return (
    <article className={"xora-epg-programme" + (now ? " is-now" : "")}>
      <div className="xora-epg-programme-time">
        <time>{timeLabel(programme.start)}</time>
        <span>{timeLabel(programme.stop)}</span>
      </div>
      <div className="xora-epg-programme-copy">
        <strong>{programme.title}</strong>
        {programme.description ? <p>{programme.description}</p> : null}
        {now ? <div className="xora-epg-progress"><i style={{ width: progress + "%" }} /></div> : null}
      </div>
      {now ? <span className="xora-epg-now-pill">NOW</span> : null}
    </article>
  );
}

export function LiveTvEpgPanel({ channelId, channels }: { channelId: string; channels: EpgChannelRef[] }) {
  const [tab, setTab] = useState<"now" | "day" | "grid">("now");
  const [dateValue, setDateValue] = useState(() => {
    const date = new Date();
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  });
  const [scrollTop, setScrollTop] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selected = channels.find((item) => item.id === channelId);
  const nowQuery = useQuery({
    queryKey: ["xora-epg-now-next", channelId],
    queryFn: () => getNowAndNext(channelId),
    enabled: Boolean(channelId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const dayQuery = useQuery({
    queryKey: ["xora-epg-day", channelId, dateValue, refreshVersion],
    queryFn: () => getDayGuide(channelId, dateValue),
    enabled: Boolean(channelId) && tab === "day",
    staleTime: 60_000,
  });
  const gridStart = Date.now() - 2 * 3600000;
  const gridEnd = Date.now() + 12 * 3600000;
  const gridChannels = useMemo(() => channels.slice(0, 100), [channels]);
  const gridQuery = useQuery({
    queryKey: ["xora-epg-grid", gridChannels.map((item) => item.id).join(","), Math.floor(gridStart / 60000), refreshVersion],
    queryFn: () => getGridWindow(gridChannels.map((item) => item.id), gridStart, gridEnd),
    enabled: tab === "grid" && gridChannels.length > 0,
    staleTime: 60_000,
  });
  const now = nowQuery.data?.now || null;
  const next = nowQuery.data?.next || null;
  const rows = gridQuery.data || [];
  const mappingQuery = useQuery({
    queryKey: ["xora-epg-mapping-options", refreshVersion],
    queryFn: async () => ({ unmatched: await getEpgUnmatchedChannels(), epgChannels: await getAvailableEpgChannels() }),
    staleTime: 60_000,
  });
  const rowHeight = 58;
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - 3);
  const visibleEnd = Math.min(gridChannels.length, visibleStart + 14);
  const hours = gridEnd - gridStart;
  const dayProgrammes = dayQuery.data || [];

  return (
    <section className="xora-epg-panel">
      <header className="xora-epg-heading">
        <div className="xora-epg-heading-icon"><CalendarDays aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <h2>Programme guide</h2>
          <p>{selected?.name || "Live TV"} · Times shown in your local timezone</p>
        </div>
        <Button type="button" size="icon" variant="ghost" className="xora-epg-refresh" aria-label="Refresh TV guide" disabled={refreshing} onClick={() => { setRefreshing(true); void refreshEpg({ force: true }).then(() => setRefreshVersion((value) => value + 1)).catch((error) => console.warn("[Xora EPG]", error)).finally(() => setRefreshing(false)); }}>
          <RefreshCw className={"size-4" + (refreshing ? " animate-spin" : "")} />
        </Button>
      </header>
      <nav className="xora-epg-tabs" aria-label="TV guide views">
        <button type="button" className={tab === "now" ? "active" : ""} onClick={() => setTab("now")}><Clock3 />Now / Next</button>
        <button type="button" className={tab === "day" ? "active" : ""} onClick={() => setTab("day")}><CalendarDays />Full day</button>
        <button type="button" className={tab === "grid" ? "active" : ""} onClick={() => setTab("grid")}><Grid3X3 />Timeline</button>
      </nav>

      {mappingQuery.data?.unmatched.length ? (
        <details className="xora-epg-mapping">
          <summary>Channel matching · {mappingQuery.data.unmatched.length} need attention</summary>
          <p>These channels did not match an XMLTV ID or a unique channel name. Choose the correct guide channel to link them manually.</p>
          {mappingQuery.data.unmatched.slice(0, 10).map((channel) => (
            <label key={channel.id}>
              <span>{channel.name}</span>
              <select defaultValue="" onChange={(event) => {
                const epgId = event.target.value;
                if (!epgId) return;
                void mapChannelManually(channel.id, epgId).then(() => setRefreshVersion((value) => value + 1));
              }}>
                <option value="">Select guide channel…</option>
                {mappingQuery.data?.epgChannels.slice(0, 100).map((epgChannel) => (
                  <option key={epgChannel.id} value={epgChannel.id}>{epgChannel.displayName || epgChannel.id}</option>
                ))}
              </select>
            </label>
          ))}
        </details>
      ) : null}

      {tab === "now" ? (
        <div className="xora-epg-content">
          {nowQuery.isError ? <p className="xora-epg-state">The TV guide could not be loaded. Try refreshing.</p> : nowQuery.isLoading ? <p className="xora-epg-state">Loading programme schedule…</p> : now || next ? (
            <>
              {now ? <ProgrammeCard programme={now} now /> : <p className="xora-epg-state">Nothing is scheduled right now.</p>}
              {next ? <ProgrammeCard programme={next} /> : null}
            </>
          ) : <p className="xora-epg-state">No guide data</p>}
        </div>
      ) : null}

      {tab === "day" ? (
        <div className="xora-epg-content">
          <label className="xora-epg-date">Choose day <input type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)} /></label>
          {dayQuery.isError ? <p className="xora-epg-state">The day guide could not be loaded.</p> : dayQuery.isLoading ? <p className="xora-epg-state">Loading full-day guide…</p> : dayProgrammes.length ? dayProgrammes.map((item) => <ProgrammeCard key={item.id} programme={item} now={item.start <= Date.now() && item.stop > Date.now()} />) : <p className="xora-epg-state">No guide data for this day.</p>}
        </div>
      ) : null}

      {tab === "grid" ? (
        <div className="xora-epg-content">
          {gridQuery.isError ? <p className="xora-epg-state">The timeline could not be loaded.</p> : gridQuery.isLoading ? <p className="xora-epg-state">Preparing timeline…</p> : !rows.length ? <p className="xora-epg-state">No guide data</p> : (
            <div className="xora-epg-grid-viewport" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
              <div className="xora-epg-grid-timeline" style={{ minWidth: "820px" }}>
                <div className="xora-epg-grid-times">
                  {Array.from({ length: 8 }, (_, index) => {
                    const time = gridStart + index * 2 * 3600000;
                    return <span key={index}>{timeLabel(time)}</span>;
                  })}
                </div>
                <div style={{ height: visibleStart * rowHeight }} />
                {gridChannels.slice(visibleStart, visibleEnd).map((channel) => {
                  const programmes = rows.filter((item) => item.channelId === channel.id || item.channelId === channel.id);
                  return (
                    <div className="xora-epg-grid-row" key={channel.id} style={{ height: rowHeight }}>
                      <strong title={channel.name}>{channel.name}</strong>
                      <div className="xora-epg-grid-track">
                        {programmes.map((item) => {
                          const left = Math.max(0, ((item.start - gridStart) / hours) * 100);
                          const width = Math.max(1, ((Math.min(item.stop, gridEnd) - Math.max(item.start, gridStart)) / hours) * 100);
                          if (item.stop <= gridStart || item.start >= gridEnd) return null;
                          return <span key={item.id} title={item.title} style={{ left: left + "%", width: width + "%" }}>{item.title}</span>;
                        })}
                      </div>
                    </div>
                  );
                })}
                <div style={{ height: Math.max(0, gridChannels.length - visibleEnd) * rowHeight }} />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
