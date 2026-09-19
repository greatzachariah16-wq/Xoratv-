import { useEffect, useState } from "react";
import { Activity, Clock, Eye, Globe, Radio, UserCheck, UserX, Users } from "lucide-react";
import {
  subscribeToPresence,
  formatSessionDuration,
  type ActiveUserSession,
  type SessionHistoryRecord,
} from "@/integrations/firebase/presence";
import { timeAgo } from "@/lib/format";

export function AdminLiveUsersTracker() {
  const [currentActive, setCurrentActive] = useState<ActiveUserSession[]>([]);
  const [previousActive, setPreviousActive] = useState<SessionHistoryRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");

  useEffect(() => {
    const unsub = subscribeToPresence(({ currentActiveUsers, previousActiveUsers }) => {
      setCurrentActive(currentActiveUsers);
      setPreviousActive(previousActiveUsers);
    });
    return () => unsub();
  }, []);

  return (
    <section
      id="presence"
      className="scroll-mt-6 rounded-3xl border border-border/80 bg-card p-5 shadow-card sm:p-7"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Radio className="size-3.5 animate-pulse text-success" />
            Live Activity Tracker (2s Heartbeat)
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold">
            Active Viewers & Session Logs
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Monitors real-time account activity, current viewing page, and tracks session duration
            when users leave.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={
              activeTab === "live"
                ? "flex items-center gap-2 rounded-xl bg-primary px-3.5 py-1.5 text-primary-foreground shadow-sm"
                : "flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-muted-foreground hover:text-foreground"
            }
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Live Now ({currentActive.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={
              activeTab === "history"
                ? "flex items-center gap-2 rounded-xl bg-primary px-3.5 py-1.5 text-primary-foreground shadow-sm"
                : "flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-muted-foreground hover:text-foreground"
            }
          >
            <Clock className="size-3.5" />
            Previous Sessions ({previousActive.length})
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-surface p-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Current Live Users
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-success animate-pulse" />
            <span className="font-display text-2xl font-bold tabular-nums">
              {currentActive.length}
            </span>
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Pinging server every 2 seconds
          </span>
        </div>

        <div className="rounded-2xl border border-border/70 bg-surface p-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Recorded Sessions
          </span>
          <div className="mt-1 flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <span className="font-display text-2xl font-bold tabular-nums">
              {previousActive.length}
            </span>
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Completed viewer sessions
          </span>
        </div>

        <div className="rounded-2xl border border-border/70 bg-surface p-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Active Pages
          </span>
          <div className="mt-1 flex items-center gap-2">
            <Globe className="size-4 text-sage" />
            <span className="font-display text-2xl font-bold tabular-nums">
              {new Set(currentActive.map((u) => u.path)).size}
            </span>
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Unique sections currently open
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
        {activeTab === "live" ? (
          currentActive.length > 0 ? (
            <div className="divide-y divide-border">
              {currentActive.map((user) => (
                <article
                  key={user.sessionId}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt=""
                          className="size-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {user.displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-success" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {user.displayName}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          @{user.username}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        Viewing{" "}
                        <code className="rounded bg-background px-1.5 py-0.5 font-mono text-primary">
                          {user.path}
                        </code>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-right">
                      <span className="block font-mono text-xs font-semibold text-success">
                        {formatSessionDuration(user.durationSeconds || 1)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">Live duration</span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-[11px] font-semibold text-success">
                      <span className="size-1.5 rounded-full bg-success animate-ping" />
                      Live
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <UserCheck className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-semibold">No active users pinging right now</p>
              <p className="mt-1 text-xs text-muted-foreground">
                As viewers open XoraTV, their live session duration and viewing path will appear
                here in real-time.
              </p>
            </div>
          )
        ) : previousActive.length > 0 ? (
          <div className="divide-y divide-border">
            {previousActive.map((session) => (
              <article
                key={session.sessionId}
                className="flex flex-col gap-3 p-4 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {session.photoURL ? (
                      <img
                        src={session.photoURL}
                        alt=""
                        className="size-10 rounded-full object-cover grayscale opacity-75"
                      />
                    ) : (
                      <div className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground font-bold text-sm">
                        {session.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-muted-foreground/40" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {session.displayName}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        @{session.username}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Last on{" "}
                      <code className="rounded bg-background px-1.5 py-0.5 font-mono text-foreground/80">
                        {session.path}
                      </code>{" "}
                      · Left {timeAgo(session.endedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="text-right">
                    <span className="block font-mono text-xs font-semibold text-foreground">
                      {formatSessionDuration(session.durationSeconds)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      Total stayed duration
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-muted-foreground">
                    <UserX className="size-3" /> Offline
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <Clock className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-semibold">No previous session history yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When active users navigate away or go offline, their session durations will be
              recorded here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
