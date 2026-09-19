import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { XSERIS_CATEGORIES, type XserisCandidate, type XserisCategory } from "@/lib/xseris/types";

const initialUrls = Array.from({ length: 20 }, () => "");

export function XserisController() {
  const [urls, setUrls] = useState(initialUrls);
  const [items, setItems] = useState<XserisCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<XserisCandidate>>>({});
  const count = useMemo(() => urls.filter(Boolean).length, [urls]);

  useEffect(() => {
    let active = true;
    fetch("/api/xseris/candidates", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.ok && Array.isArray(d.items)) {
          setItems(d.items);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const patchUrl = (i: number, value: string) =>
    setUrls((p) => p.map((v, n) => (n === i ? value : v)));

  async function processLinks() {
    const entered = urls.map((v) => v.trim()).filter(Boolean);
    if (!entered.length) return toast.error("Paste at least one URL.");
    if (entered.length > 20) return toast.error("Maximum 20 URLs.");
    const normalized = entered.map((v) => {
      try {
        const u = new URL(v);
        u.hash = "";
        u.hostname = u.hostname.toLowerCase();
        return u.toString().replace(/\/$/, "");
      } catch {
        return null;
      }
    });
    if (normalized.some((v) => !v)) return toast.error("One or more URLs are invalid.");
    if (new Set(normalized).size !== normalized.length)
      return toast.error("Duplicate URLs are not allowed.");
    setBusy(true);
    try {
      const r = await fetch("/api/xseris/process", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: entered }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "Processing failed.");
      setItems(data.items);
      setDrafts({});
      toast.success("Batch processed.");
      if (data.warning) {
        toast.info(data.warning, { duration: 6000 });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Processing failed.");
    } finally {
      setBusy(false);
    }
  }

  const value = (item: XserisCandidate) => ({ ...item, ...(drafts[item.id] || {}) });
  const patch = (id: string, p: Partial<XserisCandidate>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), ...p } }));

  async function action(item: XserisCandidate, mode: "publish" | "reject" | "retry" | "remove") {
    const v = value(item);
    if (mode === "publish" && !v.categories?.length)
      return toast.error("Choose at least one category.");
    try {
      const r = await fetch("/api/xseris/candidates/" + encodeURIComponent(item.id) + "/" + mode, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = await r.json();
      if (!r.ok || !data.ok)
        throw new Error(data.error || (mode === "publish" ? "Publish failed." : "Reject failed."));
      setItems((list) =>
        list.map((x) =>
          x.id === item.id
            ? mode === "publish"
              ? data.item
              : { ...x, status: "rejected", processing_status: "failed" }
            : x,
        ),
      );
      toast.success(mode === "publish" ? "Published to Xora catalog." : "Candidate rejected.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed.");
    }
  }

  async function publishAllMovies() {
    const publishable = items.filter(
      (item) => item.processing_status !== "published" && item.processing_status !== "duplicate",
    );
    if (!publishable.length) {
      toast.info("No unpublished candidates remaining.");
      return;
    }
    setBusy(true);
    let successCount = 0;
    try {
      for (const item of publishable) {
        const v = value(item);
        const finalCategories = v.categories?.length ? v.categories : ["Feature"];
        const payload = { ...v, categories: finalCategories };
        const r = await fetch(
          "/api/xseris/candidates/" + encodeURIComponent(item.id) + "/publish",
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = await r.json();
        if (r.ok && data.ok) {
          successCount++;
          setItems((list) => list.map((x) => (x.id === item.id ? data.item : x)));
        }
      }
      toast.success(`Successfully published ${successCount} movies across all links!`);
    } catch {
      toast.error("1-Click publish completed with some warnings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="xseris" className="mt-10 scroll-mt-6 space-y-5">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Xseris Controller
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Source catalog importer</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Paste up to 20 permitted source links. Xora stores metadata and references only;
              source video files are never downloaded.
            </p>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
            {count}/20
          </span>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {urls.map((url, i) => (
            <label key={i} className="flex items-center gap-2">
              <span className="w-7 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Input
                value={url}
                onChange={(e) => patchUrl(i, e.target.value)}
                placeholder="https://source.example/..."
                inputMode="url"
                className="h-11 rounded-xl"
              />
            </label>
          ))}
        </div>
        <Button
          onClick={processLinks}
          disabled={busy || !count}
          className="mt-5 h-11 rounded-full px-5"
        >
          {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {busy ? "Processing…" : "Process Links"}
        </Button>
      </section>
      {items.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-4 shadow-card sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Review queue
              </p>
              <h3 className="mt-1 font-display text-xl font-semibold">{items.length} candidates</h3>
            </div>
            <Button
              onClick={publishAllMovies}
              disabled={
                busy ||
                !items.some(
                  (i) => i.processing_status !== "published" && i.processing_status !== "duplicate",
                )
              }
              className="h-11 rounded-full bg-success px-5 text-success-foreground shadow-card hover:bg-success/90"
            >
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
              1-Click Publish All Discovered Movies
            </Button>
          </div>
          <div className="space-y-3">
            {items.map((item) => {
              const v = value(item);
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-border/70 bg-surface p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row">
                    {v.thumbnail_url ? (
                      <img
                        src={v.thumbnail_url}
                        alt=""
                        className="h-32 w-full rounded-xl object-cover lg:w-52"
                      />
                    ) : (
                      <div className="grid h-32 w-full place-items-center rounded-xl bg-secondary text-xs text-muted-foreground lg:w-52">
                        No thumbnail
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase">
                          {item.processing_status.replaceAll("_", " ")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.source_provider}
                        </span>
                      </div>
                      <Input
                        className="mt-2 rounded-xl font-semibold"
                        value={v.title || ""}
                        onChange={(e) => patch(item.id, { title: e.target.value })}
                      />
                      <Textarea
                        className="mt-2 min-h-20 rounded-xl"
                        value={v.description || ""}
                        onChange={(e) => patch(item.id, { description: e.target.value })}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {XSERIS_CATEGORIES.map((cat) => {
                          const selected = (v.categories || []).includes(cat);
                          return (
                            <button
                              type="button"
                              key={cat}
                              onClick={() =>
                                patch(item.id, {
                                  categories: (selected
                                    ? (v.categories || []).filter((c) => c !== cat)
                                    : [...(v.categories || []), cat]) as XserisCategory[],
                                })
                              }
                              className={
                                selected
                                  ? "rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                                  : "rounded-full border border-border px-3 py-1.5 text-xs hover:bg-secondary"
                              }
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                        <span>
                          Duration: {v.duration ? Math.round(v.duration / 60) + " min" : "—"}
                        </span>
                        <span>Year: {v.release_year || "—"}</span>
                        <span>Language: {v.language || "—"}</span>
                      </div>
                      {item.error && <p className="mt-2 text-xs text-destructive">{item.error}</p>}
                      <p className="mt-2 truncate text-[11px] text-muted-foreground">
                        {item.source_url}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2 lg:flex-col">
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={() => action(item, "publish")}
                        disabled={
                          item.processing_status === "published" ||
                          item.processing_status === "duplicate"
                        }
                      >
                        <Check />
                        Publish
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => action(item, "retry")}
                      >
                        <RotateCcw />
                        Retry
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => action(item, "reject")}
                      >
                        <X />
                        Reject
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => action(item, "remove")}
                      >
                        <Trash2 />
                        Remove
                      </Button>
                      <Button asChild variant="ghost" size="sm" className="rounded-full">
                        <a href={item.source_url} target="_blank" rel="noreferrer">
                          <ExternalLink />
                        </a>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
