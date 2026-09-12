import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { searchQuery } from "@/lib/api";
import { AppShell } from "@/components/xora/AppShell";
import { PostCard } from "@/components/xora/PostCard";
import { UserAvatar } from "@/components/xora/UserAvatar";
import { EmptyState } from "@/components/xora/EmptyState";
import { FeedSkeleton } from "@/components/xora/Skeletons";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — Xora" },
      { name: "description", content: "Search Xora for creators, videos and lessons." },
      { property: "og:title", content: "Search — Xora" },
      { property: "og:description", content: "Find creators, videos and lessons on Xora." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [term, setTerm] = useState("");
  const { data, isFetching } = useQuery(searchQuery(term));

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Search</h1>
      <div className="relative mt-4">
        <SearchIcon
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Creators, videos, lessons…"
          aria-label="Search Xora"
          className="w-full rounded-full border border-input bg-surface py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {term.trim().length < 2 ? (
        <div className="mt-10">
          <EmptyState
            icon={SearchIcon}
            title="Search Xora"
            description="Type at least two characters to find creators, videos and lessons."
          />
        </div>
      ) : isFetching && !data ? (
        <div className="mt-6">
          <FeedSkeleton count={2} />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {data?.people.length ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                People
              </h2>
              <div className="space-y-1">
                {data.people.map((person) => (
                  <Link
                    key={person.id}
                    to="/profile/$username"
                    params={{ username: person.username }}
                    className="press flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:bg-secondary"
                  >
                    <UserAvatar path={person.avatar_url} name={person.display_name} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {person.display_name || person.username}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{person.username}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {data?.posts.length ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Posts
              </h2>
              <div className="space-y-4">
                {data.posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          ) : null}

          {!data?.people.length && !data?.posts.length && !isFetching ? (
            <EmptyState
              icon={SearchIcon}
              title="No results"
              description={`Nothing matched "${term}". Try a different word.`}
            />
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
