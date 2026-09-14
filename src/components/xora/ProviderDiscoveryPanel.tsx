import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, CheckCircle2, Globe, Play, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  searchAllProviders,
  saveCandidatesBatchToRtdb,
  getCrawlerCandidatesFromRtdb,
  publishCandidate,
  removeCrawlerCandidate,
  type ProviderCandidate,
  type ProviderType,
} from "@/integrations/providers";
import type { FeedType } from "@/integrations/firebase/types";
import { duration as fmtDuration } from "@/lib/format";

export function ProviderDiscoveryPanel() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<ProviderType[]>([
    "youtube",
    "vimeo",
    "dailymotion",
  ]);
  const [targetFeed, setTargetFeed] = useState<FeedType>("home");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ProviderCandidate[]>([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error("Enter a search term");
      return;
    }
    if (selectedProviders.length === 0) {
      toast.error("Select at least one content provider");
      return;
    }

    setSearching(true);
    try {
      const results = await searchAllProviders({
        query: query.trim(),
        providers: selectedProviders,
        feed: targetFeed,
        limit: 12,
      });

      if (results.length === 0) {
        toast.info("No provider results found. Check your API keys or search term.");
      } else {
        toast.success(`Found ${results.length} items from ${selectedProviders.join(", ")}`);
        // Persist discovered candidates to RTDB /crawler/candidates
        await saveCandidatesBatchToRtdb(results);
        setCandidates(results);
      }
    } catch (err) {
      console.error("Discovery error:", err);
      toast.error("Failed to search content providers");
    } finally {
      setSearching(false);
    }
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

  const handleDismiss = async (candidateId: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    await removeCrawlerCandidate(candidateId);
  };

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Content Provider Discovery
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Search YouTube, Vimeo, and Dailymotion to discover metadata and publish to live feeds.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <Globe className="size-3.5" />
          Live APIs
        </span>
      </div>

      <form onSubmit={handleSearch} className="mt-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search horror films, trailers, shorts, or indie creators..."
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

            <button
              type="submit"
              disabled={searching}
              className="press inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {searching ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="size-4" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>

        {/* Provider selectors */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="font-semibold text-foreground">Providers:</span>
          {(
            [
              { id: "youtube", label: "YouTube Data API" },
              { id: "vimeo", label: "Vimeo API" },
              { id: "dailymotion", label: "Dailymotion API" },
            ] as const
          ).map((p) => {
            const checked = selectedProviders.includes(p.id);
            return (
              <label
                key={p.id}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 select-none hover:bg-secondary"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleProvider(p.id)}
                  className="rounded border-border text-primary focus:ring-0"
                />
                <span className="capitalize">{p.label}</span>
              </label>
            );
          })}
        </div>
      </form>

      {/* Discovered candidates list */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {candidates.length > 0
              ? `${candidates.length} Candidate${candidates.length === 1 ? "" : "s"} in Queue (/crawler/candidates)`
              : "No candidates yet. Use the search above to discover provider content."}
          </span>
        </div>

        {candidates.map((c) => {
          const isPublished = publishedIds.has(c.id);
          const isPublishing = publishingId === c.id;

          return (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-36">
                {c.thumbnailUrl ? (
                  <img
                    src={c.thumbnailUrl}
                    alt={c.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Play className="size-6" />
                  </div>
                )}
                {c.durationSeconds ? (
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 font-mono text-[9px] text-white">
                    {fmtDuration(c.durationSeconds)}
                  </span>
                ) : null}
              </div>

              {/* Details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                    {c.provider}
                  </span>
                  {c.channelName ? (
                    <span className="truncate text-xs text-muted-foreground">{c.channelName}</span>
                  ) : null}
                </div>

                <h3 className="mt-1 truncate text-sm font-semibold text-foreground" title={c.title}>
                  {c.title}
                </h3>

                {c.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {c.description}
                  </p>
                ) : null}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                <a
                  href={c.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                  Source
                </a>

                <button
                  type="button"
                  onClick={() => handleDismiss(c.id)}
                  className="press rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
                >
                  Dismiss
                </button>

                <button
                  type="button"
                  onClick={() => handlePublish(c)}
                  disabled={isPublishing || isPublished}
                  className="press inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
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
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
