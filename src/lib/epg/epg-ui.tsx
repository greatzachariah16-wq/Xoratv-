import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, RefreshCw } from "lucide-react";
import { configureEpg, getDayGuide, getEpgMappingOptions, getEpgSettings, getNowAndNext, getProgress, refreshEpg, setEpgChannelMapping, type EpgRefreshOptions } from "./epg-api";
import type { EpgProgramme } from "./epg-store";
import "@/styles/epg.css";

function time(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function EpgNowNext({ channelId }: { channelId: string }) {
  const [data, setData] = useState<{now:EpgProgramme|null;next:EpgProgramme|null}>({now:null,next:null});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => void getNowAndNext(channelId).then((value) => { if (active) { setData(value); setFailed(false); } }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [channelId]);
  if (loading) return <p className="xora-epg-muted">Loading programme guide…</p>;
  if (failed) return <p className="xora-epg-muted">Programme guide could not be loaded. Try refreshing.</p>;
  if (!data.now && !data.next) return <p className="xora-epg-muted">No guide data</p>;
  return <div className="xora-epg-now-next">
    {data.now ? <div><span className="xora-epg-kicker">NOW</span><strong>{data.now.title}</strong><small>{time(data.now.start)} – {time(data.now.stop)}</small>
      <div className="xora-epg-progress"><i style={{width: getProgress(data.now) + "%"}} /></div></div> : <div><span className="xora-epg-kicker">NOW</span><strong>No guide data</strong></div>}
    {data.next ? <div><span className="xora-epg-kicker">NEXT</span><strong>{data.next.title}</strong><small>{time(data.next.start)}</small></div> : null}
  </div>;
}

export function EpgDayGuide({ channelId }: { channelId: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [programmes, setProgrammes] = useState<EpgProgramme[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; setLoading(true); void getDayGuide(channelId, date).then((items) => { if (active) { setProgrammes(items); setFailed(false); } }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [channelId, date]);
  return <section className="xora-epg-day">
    <label><CalendarDays size={15}/> Full-day guide <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    {loading ? <p className="xora-epg-muted">Loading daily schedule…</p> : failed ? <p className="xora-epg-muted">Daily schedule could not be loaded.</p> : programmes.length ? programmes.map((item) => <article key={item.id}><time>{time(item.start)} – {time(item.stop)}</time><strong>{item.title}</strong>{item.description ? <p>{item.description}</p> : null}</article>) : <p className="xora-epg-muted">No guide data</p>}
  </section>;
}

export function EpgRefreshButton(props: EpgRefreshOptions) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <div className="xora-epg-refresh"><button type="button" disabled={busy} onClick={() => { setBusy(true); setMessage(""); void refreshEpg(props).then((result) => setMessage(result.unchanged ? "Guide is up to date" : "Updated " + result.count.toLocaleString() + " programmes")).catch((error) => setMessage(error instanceof Error ? error.message : "EPG update failed")).finally(() => setBusy(false)); }}><RefreshCw size={14} className={busy ? "animate-spin" : ""}/> {busy ? "Updating guide" : "Refresh guide"}</button>{message ? <small>{message}</small> : null}</div>;
}

export function EpgTimelineGrid({ channels, startTime, endTime }: { channels: Array<{id:string;name:string}>; startTime:number; endTime:number }) {
  const [rows, setRows] = useState<Array<{channelId:string;programmes:EpgProgramme[]}>>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [loading, setLoading] = useState(true);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let active = true;
    void import("./epg-api").then(({getGridWindow}) => getGridWindow(channels.map((c) => c.id), startTime, endTime)) .then((value) => { if(active) setRows(value); }).finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  }, [channels, startTime, endTime]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.channelId, row.programmes])), [rows]);
  const span = Math.max(1, endTime - startTime);
  const rowHeight = 54;
  const virtualized = channels.length > 20;
  const first = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - 4) : 0;
  const last = virtualized ? Math.min(channels.length, first + 18) : channels.length;
  if (loading) return <p className="xora-epg-muted">Loading channel timeline…</p>;
  return <div ref={viewportRef} className="xora-epg-grid-viewport" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} role="table" aria-label="Programme timeline">
    <div className="xora-epg-grid-hours"><span>Channel</span>{[0,6,12,18,24].map((hour) => <time key={hour}>{hour === 24 ? "00:00" : String(hour).padStart(2,"0")+":00"}</time>)}</div>
    {virtualized ? <div style={{height:first*rowHeight}} aria-hidden="true" /> : null}
    {channels.slice(first,last).map((channel) => <div className="xora-epg-grid-row" role="row" key={channel.id} style={{height:rowHeight}}>
      <strong role="rowheader">{channel.name}</strong><div className="xora-epg-grid-track">{(byId.get(channel.id) || []).map((programme) => <span key={programme.id} title={programme.title} style={{left: ((programme.start-startTime)/span*100)+"%",width: (Math.max(0,Math.min(endTime,programme.stop)-Math.max(startTime,programme.start))/span*100)+"%"}}>{programme.title}</span>)}</div>
    </div>)}
    {virtualized ? <div style={{height:(channels.length-last)*rowHeight}} aria-hidden="true" /> : null}
  </div>;
}


export function EpgSettings() {
  const [url, setUrl] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [unmatched, setUnmatched] = useState<Array<{id:string;name:string}>>([]);
  const [epgChannels, setEpgChannels] = useState<Array<{id:string;name:string}>>([]);
  const loadMappings = () => void getEpgMappingOptions().then((data) => { setUnmatched(data.unmatched); setEpgChannels(data.epgChannels); });
  useEffect(() => {
    let active = true;
    void getEpgSettings().then((settings) => {
      if (active) { setUrl(settings.url); setProxyUrl(settings.proxyUrl); }
    });
    void getEpgMappingOptions().then((data) => {
      if (active) { setUnmatched(data.unmatched); setEpgChannels(data.epgChannels); }
    });
    return () => { active = false; };
  }, []);
  const save = async () => {
    if (!url.trim()) { setMessage("Enter your XMLTV URL first."); return; }
    setBusy(true);
    setMessage("Saving guide source...");
    try {
      await configureEpg(url, proxyUrl || undefined);
      const result = await refreshEpg({ force: true, url, proxyUrl: proxyUrl || undefined });
      setMessage(result.unchanged ? "Guide is already up to date." : "Guide updated: " + result.count.toLocaleString() + " programmes.");
      loadMappings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the guide.");
    } finally { setBusy(false); }
  };
  return <details className="xora-epg-settings">
    <summary><ChevronDown size={14}/> EPG source settings</summary>
    <div className="xora-epg-settings-fields">
      <label>XMLTV URL<input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://provider.example/guide.xml.gz" /></label>
      <label>Optional proxy URL template<input type="url" inputMode="url" value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="https://your-proxy.example/?url={url}" /></label>
      <small>Use {"{url}"} where the encoded XMLTV URL should be inserted. Leave blank to fetch through Xora's streaming endpoint.</small>
      <button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Updating..." : "Save & refresh guide"}</button>
      {message ? <p role="status">{message}</p> : null}
      {unmatched.length ? <div className="xora-epg-mappings"><strong>Unmatched channels ({unmatched.length})</strong>{unmatched.slice(0, 30).map((channel) => <label key={channel.id}>{channel.name}<select defaultValue="" onChange={(event) => { if (event.target.value) void setEpgChannelMapping(channel.id, event.target.value).then(loadMappings); }}><option value="">Choose guide channel</option>{epgChannels.map((epg) => <option key={epg.id} value={epg.id}>{epg.name} · {epg.id}</option>)}</select></label>)}</div> : null}
    </div>
  </details>;
}
