import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Loader2,
  CheckCircle2,
  Globe,
  Play,
  ExternalLink,
  Waves,
  Sparkles,
  Send,
  AlertCircle,
  RefreshCw,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  searchAllProvidersWithStatus,
  saveCandidatesBatchToRtdb,
  getCrawlerCandidatesFromRtdb,
  publishCandidate,
  removeCrawlerCandidate,
  type ProviderCandidate,
  type ProviderType,
  type ProviderExecutionStatus,
} from "@/integrations/providers";
import type { FeedType } from "@/integrations/firebase/types";
import { duration as fmtDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";

const QUICK_QUERIES = [
  { label: "Deep Sea", query: "deep sea", provider: "noaa" as const },
  { label: "ROV Exploration", query: "rov exploration dive", provider: "noaa" as const },
  { label: "Hydrothermal Vents", query: "hydrothermal vent", provider: "noaa" as const },
  { label: "Marine Life", query: "marine life cusk eel squid", provider: "noaa" as const },
  { label: "Deep Corals", query: "deep sea coral sponge", provider: "noaa" as const },
  { label: "Shipwrecks", query: "shipwreck exploration", provider: "noaa" as const },
  {
    label: "Science & Nature",
    query: "deep sea science documentary",
    provider: "youtube" as const,
  },
];

export function ProviderDiscoveryPanel() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("deep sea exploration");
  const [selectedProviders, setSelectedProviders] = useState<ProviderType[]>([
    "noaa",
    "youtube",
    "vimeo",
    "dailymotion",
  ]);
  const [targetFeed, setTargetFeed] = useState<FeedType>("home");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ProviderCandidate[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderExecutionStatus[]>([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());
  const [publishingAll, setPublishingAll] = useState(false);
  const [runningAutoDiscovery, setRunningAutoDiscovery] = useState(false);

  // Load existing candidates from RTDB crawler queue on mount
  useEffect(() => {
    getCrawlerCandidatesFromRtdb().then((saved) => {
      if (saved && saved.length > 0) {
        setCandidates(saved);
      }
    });
  }, []);

  const toggleProvider = (provider: ProviderType) => {
    setSelectedProviders((prev) =>
      prev.includes(provider) ? prev.filter((p) => p !== provider) : [...prev, provider],
    );
  };

  const executeSearch = async (searchTerm: string, providersToUse = selectedProviders) => {
    if (!searchTerm.trim()) {
      toast.error("Enter a search term");
      return;
    }
    if (providersToUse.length === 0) {
      toast.error("Select at least one content provider");
      return;
    }

    setSearching(true);
    try {
      const result = await searchAllProvidersWithStatus({
        query: searchTerm.trim(),
        providers: providersToUse,
        feed: targetFeed,
        limit: 15,
      });

      setProviderStatuses(result.statuses);

      // Provide clear per-provider notifications if any failed
      for (const st of result.statuses) {
        if (!st.ok) {
          if (st.error?.includes("not configured")) {
            toast.info(`${st.provider.toUpperCase()}: skipped (${st.error})`);
          } else {
            toast.warning(`${st.provider.toUpperCase()}: ${st.error || "Search failed"}`);
          }
        }
      }

      if (result.candidates.length === 0) {
        toast.info("No provider results found for this query.");
      } else {
        toast.success(`Discovered ${result.candidates.length} items across active providers!`);
        // Persist discovered candidates to RTDB /crawler/candidates
        await saveCandidatesBatchToRtdb(result.candidates);
        setCandidates(result.candidates);
      }
    } catch (err) {
      console.error("Discovery error:", err);
      toast.error("Failed to search content providers");
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleTriggerAutoDiscovery = async () => {
    setRunningAutoDiscovery(true);
    try {
      const res = await fetch("/api/discovery/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(
          `Automated discovery finished! Discovered: ${data.summary?.totalDiscoveredCandidates || 0}, Published: ${data.summary?.totalAutoPublishedPosts || 0}`,
        );
        queryClient.invalidateQueries({ queryKey: ["feed"] });
        queryClient.invalidateQueries({ queryKey: ["admin"] });
        // Refresh candidates
        const saved = await getCrawlerCandidatesFromRtdb();
        if (saved) setCandidates(saved);
      } else {
        toast.error(`Auto discovery error: ${data.error || "Unknown"}`);
      }
    } catch (err) {
      console.error("Auto discovery trigger error:", err);
      toast.error("Failed to trigger automated discovery");
    } finally {
      setRunningAutoDiscovery(false);
    }
  };

  const handleQuickChip = (chipQuery: string, chipProvider?: ProviderType) => {
    setQuery(chipQuery);
    if (chipProvider && !selectedProviders.includes(chipProvider)) {
      setSelectedProviders((prev) => [...prev, chipProvider]);
    }
    executeSearch(
      chipQuery,
      chipProvider && !selectedProviders.includes(chipProvider)
        ? [...selectedProviders, chipProvider]
        : selectedProviders,
    );
  };

  const handlePublish = async (candidate: ProviderCandidate) => {
    setPublishingId(candidate.id);
    try {
      await publishCandidate(candidate, targetFeed);
      setPublishedIds((prev) => new Set([...prev, candidate.id]));
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success(`Published "${candidate.title.slice(0, 30)}..." to ${targetFeed} feed!`);
    } catch (err) {
      console.error("Publish error:", err);
      toast.error("Failed to publish candidate to feed");
    } finally {
      setPublishingId(null);
    }
  };

  const handlePublishAll = async () => {
    if (candidates.length === 0) return;
    setPublishingAll(true);
    let successCount = 0;
    try {
      for (const candidate of candidates) {
        if (!publishedIds.has(candidate.id)) {
          await publishCandidate(candidate, targetFeed);
          setPublishedIds((prev) => new Set([...prev, candidate.id]));
          successCount++;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success(`Published ${successCount} videos to ${targetFeed} feed!`);
    } catch (err) {
      console.error("Batch publish error:", err);
      toast.error("Error during batch publishing");
    } finally {
      setPublishingAll(false);
    }
  };

  const handleDismiss = async (candidateId: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    await removeCrawlerCandidate(candidateId);
  };

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Programming desk
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400">
              <Waves className="size-3" />
              Multi-Source Discovery
            </span>
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-normal">
            Content Discovery & Ingestion
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Search and ingest deep-sea footage and videos from NOAA Ocean Exploration, YouTube,
            Vimeo, and Dailymotion into Firebase RTDB feeds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTriggerAutoDiscovery}
            disabled={runningAutoDiscovery}
            className="rounded-xl border-primary/30 text-primary hover:bg-primary/10 gap-1.5 text-xs"
          >
            {runningAutoDiscovery ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Auto Ingesting...
              </>
            ) : (
              <>
                <Zap className="size-3.5" />
                Run Full Auto-Discovery
              </>
            )}
          </Button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <Globe className="size-3.5" />
            Live APIs
          </span>
        </div>
      </div>

      {/* Quick Search Chips */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mr-1">
          <Sparkles className="size-3 text-primary" /> Popular Topics:
        </span>
        {QUICK_QUERIES.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => handleQuickChip(chip.query, chip.provider)}
            className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary hover:text-foreground hover:bg-secondary"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} className="mt-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search deep sea, hydrothermal vents, marine creatures, ROV dives, science..."
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={targetFeed}
              onChange={(e) => setTargetFeed(e.target.value as FeedType)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
            >
              <option value="home">Home Feed</option>
              <option value="shorts">Shorts Feed</option>
              <option value="learn">Learn Feed</option>
            </select>

            <Button type="submit" disabled={searching} className="h-10 rounded-xl px-4 shadow-none">
              {searching ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="size-4" />
                  Discover
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Provider selectors */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-foreground">Providers:</span>
          {(
            [
              { id: "noaa", label: "NOAA Ocean Exploration (Open Public)", highlight: true },
              { id: "youtube", label: "YouTube Data API" },
              { id: "vimeo", label: "Vimeo API" },
              { id: "dailymotion", label: "Dailymotion API" },
            ] as const
          ).map((p) => {
            const checked = selectedProviders.includes(p.id);
            return (
              <label
                key={p.id}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 select-none transition ${
                  p.highlight
                    ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                    : "border-border hover:bg-secondary"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleProvider(p.id)}
                  className="rounded border-border text-primary focus:ring-0"
                />
                <span className="font-medium">{p.label}</span>
              </label>
            );
          })}
        </div>

        {/* Provider Execution Diagnostic Status Badges */}
        {providerStatuses.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {providerStatuses.map((st) => (
              <div
                key={st.provider}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium border ${
                  st.ok
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                    : st.error?.includes("not configured")
                      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                }`}
              >
                {st.ok ? (
                  <CheckCircle2 className="size-3 text-emerald-400" />
                ) : (
                  <AlertCircle className="size-3 text-amber-400" />
                )}
                <span className="uppercase font-bold tracking-wider">{st.provider}:</span>
                <span>{st.ok ? `${st.count} found` : st.error || "Unavailable"}</span>
              </div>
            ))}
          </div>
        )}
      </form>

      {/* Discovered candidates list */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {candidates.length > 0
              ? `${candidates.length} Discovered Item${candidates.length === 1 ? "" : "s"} In Queue`
              : "No candidates in queue. Click 'Discover' or 'Run Full Auto-Discovery' above."}
          </span>
          {candidates.length > 0 && (
            <button
              type="button"
              onClick={handlePublishAll}
              disabled={publishingAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
            >
              {publishingAll ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  Publishing All...
                </>
              ) : (
                <>
                  <Send className="size-3" />
                  Publish All to {targetFeed} Feed
                </>
              )}
            </button>
          )}
        </div>

        {candidates.map((c) => {
          const isPublished = publishedIds.has(c.id);
          const isPublishing = publishingId === c.id;

          return (
            <article
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-40">
                {c.thumbnailUrl ? (
                  <img
                    src={c.thumbnailUrl}
                    alt={c.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground bg-cyan-950/40">
                    <Waves className="size-6 text-cyan-400/60" />
                  </div>
                )}
                {c.durationSeconds ? (
                  <span className="absolute bottom-1 right-1 rounded bg-ink/80 px-1 font-mono text-[9px] text-primary-foreground">
                    {fmtDuration(c.durationSeconds)}
                  </span>
                ) : null}
                {c.resolution && (
                  <span className="absolute top-1 left-1 rounded bg-cyan-900/90 border border-cyan-500/30 px-1 font-mono text-[9px] text-cyan-200">
                    {c.resolution}
                  </span>
                )}
              </div>

              {/* Details */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                      c.provider === "noaa"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {c.provider === "noaa" ? "NOAA Deep Sea" : c.provider}
                  </span>
                  {c.dive && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border">
                      {c.dive}
                    </span>
                  )}
                  {c.expedition && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border">
                      {c.expedition}
                    </span>
                  )}
                  {c.channelName && c.provider !== "noaa" ? (
                    <span className="truncate text-xs text-muted-foreground">{c.channelName}</span>
                  ) : null}
                  {c.viewCount != null && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border">
                      {c.viewCount.toLocaleString()} views
                    </span>
                  )}
                </div>

                <h3 className="mt-1 truncate text-sm font-semibold text-foreground" title={c.title}>
                  {c.title}
                </h3>

                {c.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {c.description}
                  </p>
                ) : null}

                {c.credit && (
                  <p className="mt-1 text-[10px] text-cyan-400/80 line-clamp-1">{c.credit}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                <a
                  href={c.watchUrl || c.embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                  Source
                </a>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDismiss(c.id)}
                  className="rounded-lg text-muted-foreground"
                >
                  Dismiss
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => handlePublish(c)}
                  disabled={isPublishing || isPublished}
                  className="rounded-lg shadow-none"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Publishing...
                    </>
                  ) : isPublished ? (
                    <>
                      <CheckCircle2 className="size-3.5" />
                      Published
                    </>
                  ) : (
                    "Publish"
                  )}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
