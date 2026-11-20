import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Clock3, RefreshCw } from "lucide-react";
import { getDayGuide, getNowAndNext, getProgress, refreshEpg, type EpgRefreshOptions } from "./epg-api";
import type { EpgProgramme } from "./epg-store";

function time(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function EpgNowNext({ channelId }: { channelId: string }) {
  const [data, setData] = useState<{now:EpgProgramme|null;next:EpgProgramme|null}>({now:null,next:null});
  useEffect(() => {
    let active = true;
    const load = () => void getNowAndNext(channelId).then((value) => { if (active) setData(value); }).catch(() => {});
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [channelId]);
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
  useEffect(() => { let active = true; void getDayGuide(channelId, date).then((items) => { if (active) setProgrammes(items); }); return () => { active = false; }; }, [channelId, date]);
  return <section className="xora-epg-day">
    <label><CalendarDays size={15}/> Full-day guide <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    {programmes.length ? programmes.map((item) => <article key={item.id}><time>{time(item.start)} – {time(item.stop)}</time><strong>{item.title}</strong>{item.description ? <p>{item.description}</p> : null}</article>) : <p className="xora-epg-muted">No guide data</p>}
  </section>;
}

export function EpgRefreshButton(props: EpgRefreshOptions) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <div className="xora-epg-refresh"><button type="button" disabled={busy} onClick={() => { setBusy(true); setMessage(""); void refreshEpg(props).then((result) => setMessage(result.unchanged ? "Guide is up to date" : "Updated " + result.count.toLocaleString() + " programmes")).catch((error) => setMessage(error instanceof Error ? error.message : "EPG update failed")).finally(() => setBusy(false)); }}><RefreshCw size={14} className={busy ? "animate-spin" : ""}/> {busy ? "Updating guide" : "Refresh guide"}</button>{message ? <small>{message}</small> : null}</div>;
}

export function EpgTimelineGrid({ channels, startTime, endTime }: { channels: Array<{id:string;name:string}>; startTime:number; endTime:number }) {
  const [rows, setRows] = useState<Array<{channelId:string;programmes:EpgProgramme[]}>>([]);
  useEffect(() => {
    let active = true;
    void import("./epg-api").then(({getGridWindow}) => getGridWindow(channels.map((c) => c.id), startTime, endTime)).then((value) => { if(active) setRows(value); });
    return () => { active = false; };
  }, [channels, startTime, endTime]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.channelId, row.programmes])), [rows]);
  const span = Math.max(1, endTime - startTime);
  return <div className="xora-epg-grid" role="table" aria-label="Programme timeline">
    {channels.map((channel) => <div className="xora-epg-grid-row" role="row" key={channel.id}>
      <strong role="rowheader">{channel.name}</strong><div className="xora-epg-grid-track">{(byId.get(channel.id) || []).map((programme) => <span key={programme.id} title={programme.title} style={{left: ((programme.start-startTime)/span*100)+"%",width: (Math.max(0,Math.min(endTime,programme.stop)-Math.max(startTime,programme.start))/span*100)+"%"}}>{programme.title}</span>)}</div>
    </div>)}
  </div>;
}
