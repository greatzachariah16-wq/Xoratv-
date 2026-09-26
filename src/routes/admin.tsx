
    {
      title: "Fraud Shield & Guard",
      description: "Bot telemetry, device fingerprint collisions, and 4-tier enforcement.",
      href: "/admin/fraud",
      icon: ShieldAlert,
      badge: "Bot Guard",
      badgeColor: "bg-rose-500/10 text-rose-500 border-rose-500/20",
      accent: "text-rose-500",
      metric: "Security",
    },
    {
      title: "Users Directory",
      description: "Verified human account sign-ups, lookup profiles, and user telemetry.",
      href: "/admin/users",
      icon: Users,
      badge: `${stats?.users ?? 0} Users`,
      badgeColor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      accent: "text-blue-500",
      metric: "Accounts",
    },
    {
      title: "Customer Support Inbox",
      description: "Read community support inquiries, send in-app replies and resolve tickets.",
      href: "/admin/support",
      icon: MessageSquareText,
      badge: "Inbox",
      badgeColor: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
      accent: "text-indigo-500",
      metric: "Support",
    },
    {
      title: "Xseris Media Controller",
      description: "Ingest media links, manage TV series seasons, episodes, and catalog metadata.",
      href: "/admin/xseris",
      icon: Tv,
      badge: "Xseris Hub",
      badgeColor: "bg-primary/10 text-primary border-primary/20",
      accent: "text-primary",
      metric: "Catalog",
    },
    {
      title: "In-House Video Ads",
      description: "Sponsor campaign video insertion, targeting rules, and click analytics.",
      href: "/admin/campaigns",
      icon: Megaphone,
      badge: "Campaigns",
      badgeColor: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      accent: "text-purple-500",
      metric: "Monetization",
    },
    {
      title: "Provider Discovery Engine",
      description: "Automated ingestion pipeline for YouTube, Vimeo, FAOTV, and RSS sources.",
      href: "/admin/discovery",
      icon: Compass,
      badge: "Discovery",
      badgeColor: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
      accent: "text-cyan-500",
      metric: "Pipeline",
    },
    {
      title: "Content & Moderation",
      description: "Feed publishing queue, status toggles, and recent video moderation.",
      href: "/admin/moderation",
      icon: FileVideo,
      badge: `${reviewPosts} in queue`,
      badgeColor: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      accent: "text-amber-500",
      metric: "Moderation",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader
        title="Executive Overview"
        currentSectionId="overview"
        showBackToDashboard={false}
      />

      <main id="main" className="mx-auto max-w-[1480px] px-4 pb-24 pt-5 sm:px-8 lg:px-10">
        {/* Security bar */}
        <div className="mb-6">
          <AdminSecurityBar
            sessionInfo={sessionInfo}
            onLogout={logout}
            onRefreshSession={refreshSession}
          />
        </div>

        {/* Executive Hero Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-ink px-6 py-8 text-primary-foreground shadow-lift sm:px-10 sm:py-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                Sovereign Operations Console
              </div>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Executive Command Dashboard
              </h1>
              <p className="mt-2 text-xs text-primary-foreground/70 sm:text-sm leading-relaxed">
                Central management portal for XoraTV platform telemetry, monetization, community, and content operations.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="secondary" className="rounded-full text-xs font-semibold h-9 px-4">
                
              </Button>
              <Button asChild className="rounded-full text-xs font-semibold h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90">
                <Link to="/admin/xseris">
                  <Tv className="size-3.5 mr-1.5" /> Xseris Controller
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Executive KPI Summary */}
        <section
          aria-label="Platform Executive Totals"
          className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <Link
            to="/admin/users"
            className="group rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium">Registered Users</span>
              <Users className="size-4 text-primary group-hover:scale-110 transition-transform" />
            </div>
            <strong className="mt-2 block font-display text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
              {stats?.users ?? 0}
            </strong>
            <span className="mt-1 flex items-center text-[11px] text-muted-foreground group-hover:text-primary transition-colors">
              Manage accounts <ArrowRight className="size-3 ml-1" />
            </span>
          </Link>

          <Link
            to="/admin/moderation"
            className="group rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium">Published Media</span>
              <FileVideo className="size-4 text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
            <strong className="mt-2 block font-display text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
              {publishedPosts}
            </strong>
            <span className="mt-1 flex items-center text-[11px] text-emerald-600 dark:text-emerald-400">
              Live in feeds · {reviewPosts} queued
            </span>
          </Link>

          <Link
            to="/admin/tracker"
            className="group rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium">Active Heartbeats</span>
              <Radio className="size-4 text-success animate-pulse" />
            </div>
            <strong className="mt-2 block font-display text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
              Live Presence
            </strong>
            <span className="mt-1 flex items-center text-[11px] text-muted-foreground group-hover:text-primary transition-colors">
              Real-time monitor <ArrowRight className="size-3 ml-1" />
            </span>
          </Link>

          
              <Wifi className="size-4 text-amber-500 group-hover:scale-110 transition-transform" />
            </div>
            <strong className="mt-2 block font-display text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
              VTUshare
            </strong>
            <span className="mt-1 flex items-center text-[11px] text-muted-foreground group-hover:text-primary transition-colors">
              1GB ₦280 automation <ArrowRight className="size-3 ml-1" />
            </span>
          </Link>
        </section>

        {/* Dedicated Admin Modules Grid */}
        <section className="mt-8 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                Management Consoles
              </p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Dedicated Control Hubs
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {MODULE_CARDS.length} standalone modules
            </span>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULE_CARDS.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  to={module.href}
                  className="group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lift"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`grid size-10 place-items-center rounded-xl border border-border/70 bg-surface shadow-sm transition-transform group-hover:scale-105 ${module.accent}`}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${module.badgeColor}`}
                      >
                        {module.badge}
                      </span>
                    </div>

                    <h3 className="mt-4 font-display text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      {module.title}
                    </h3>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                      {module.description}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3 text-xs font-semibold text-primary">
                    <span>Open Console</span>
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Recent Moderation Quick Snapshot */}
        <section className="mt-10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                Activity Stream
              </p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-foreground">
                Recent Media Uploads
              </h2>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-full text-xs font-semibold h-8">
              <Link to="/admin/moderation">
                View All Queue <ArrowRight className="size-3 ml-1" />
              </Link>
            </Button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            {isPending ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Loading recent media...</div>
            ) : recentPosts.length ? (
              <div className="divide-y divide-border">
                {recentPosts.map((post, idx) => (
                  <article
                    key={post.id || `recent-post-${idx}`}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          post.status === "published" ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {post.title || post.caption || "Untitled Content"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          @{post.author?.username || "creator"} · {timeAgo(post.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button asChild variant="secondary" size="sm" className="h-7 text-[11px] rounded-full px-2.5">
                        <Link to="/video/$postId" params={{ postId: post.id }}>
                          <Eye className="size-3 mr-1" /> Preview
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] rounded-full px-2.5"
                        disabled={setStatus.isPending}
                        onClick={() =>
                          setStatus.mutate({
                            id: post.id,
                            status: post.status === "published" ? "removed" : "published",
                          })
                        }
                      >
                        {post.status === "published" ? "Remove" : "Publish"}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <ShieldCheck className="mx-auto size-6 text-primary mb-2" />
                No pending media items in moderation queue.
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Floating Menu Launcher */}
      <AdminNavigationMenu activeSectionId="overview" variant="floating" />
    </div>
  );
}
