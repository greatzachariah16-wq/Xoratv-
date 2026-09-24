import { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Gauge,
  Clock,
  Heart,
  MessageSquare,
  Share2,
  UserPlus,
  RefreshCw,
  Sparkles,
  Info,
  CheckCircle2,
  XCircle,
  Film,
  Lock,
  ArrowRight,
  Radio,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export interface EngagementStatus {
  ok: boolean;
  currentPeriod: {
    periodId: string;
    accountId: string;
    startedAt: string;
    expiresAt: string;
    verifiedWatchTimeSeconds: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    followCount: number;
    progressPercent: number;
    formattedTimeRemaining: string;
    requiredMinutes: number;
    requiredSeconds: number;
  };
  interactives: {
    likes: number;
    comments: number;
    shares: number;
    follows: number;
  };
  requirements?: {
    watchTimeMet: boolean;
    likeMet: boolean;
    followMet: boolean;
    trustScoreMet: boolean;
    missingWatchMinutes: number;
    missingLikes: number;
    missingFollows: number;
    requiredWatchMinutes: number;
    requiredLikes: number;
    requiredFollows: number;
  };
  activeSession?: {
    status: "streaming" | "paused" | "idle";
    videoId?: string | null;
    startedAt?: string | null;
  };
  eligibility: {
    eligibleToClaim: boolean;
    ineligibilityReason: string | null;
    trustScore: number;
    riskLevel: "low" | "medium" | "high" | "critical";
  };
}

interface EngagementAnalyticsCardProps {
  userId: string;
  onEligibilityChange?: (eligible: boolean, status?: EngagementStatus) => void;
  onClaimClick?: () => void;
}

export function EngagementAnalyticsCard({
  userId,
  onEligibilityChange,
  onClaimClick,
}: EngagementAnalyticsCardProps) {
  const [data, setData] = useState<EngagementStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/engagement/user-status?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const json = (await res.json()) as EngagementStatus;
        setData(json);
        if (onEligibilityChange) {
          onEligibilityChange(json.eligibility.eligibleToClaim, json);
        }
      }
    } catch (err) {
      console.error("[Engagement Card] Error fetching status:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, onEligibilityChange]);

  useEffect(() => {
    void fetchStatus();

    // Listen for instant playback & engagement updates from video player and actions
    const handleEngagementUpdate = () => {
      void fetchStatus();
    };

    window.addEventListener("xora:engagement-updated", handleEngagementUpdate);

    // Active polling interval (every 3.5s) to reflect live watch time progressions immediately
    const pollInterval = setInterval(() => {
      void fetchStatus();
    }, 3500);

    return () => {
      window.removeEventListener("xora:engagement-updated", handleEngagementUpdate);
      clearInterval(pollInterval);
    };
  }, [fetchStatus]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    void fetchStatus();
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-5 w-36 bg-muted rounded-md" />
          <div className="h-4 w-4 bg-muted rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full bg-muted rounded-md" />
          <div className="h-8 w-full bg-muted rounded-md" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.currentPeriod) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
        Unable to load your engagement analytics.
      </div>
    );
  }

  const { currentPeriod, eligibility, interactives, requirements, activeSession } = data;
  const isEligible = eligibility.eligibleToClaim;

  // Formatting hours and minutes of watch time
  const watchMinutes = Math.floor(currentPeriod.verifiedWatchTimeSeconds / 60);
  const watchSeconds = currentPeriod.verifiedWatchTimeSeconds % 60;

  // Criteria calculations
  const watchTimeMet = Boolean(
    requirements?.watchTimeMet ??
    currentPeriod.verifiedWatchTimeSeconds >= currentPeriod.requiredSeconds,
  );
  const likeMet = Boolean(
    requirements?.likeMet ??
    ((interactives.likes ?? 0) >= 1 || (currentPeriod.likeCount ?? 0) >= 1),
  );
  const followMet = Boolean(
    requirements?.followMet ??
    ((interactives.follows ?? 0) >= 1 || (currentPeriod.followCount ?? 0) >= 1),
  );

  const missingMinutes =
    requirements?.missingWatchMinutes ?? Math.max(0, currentPeriod.requiredMinutes - watchMinutes);

  // Active Stream indicator status
  const streamStatus = activeSession?.status || "idle";

  // Determine trust badge styling
  let badgeColor =
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
  let securityText = "Verified & Clear";
  if (eligibility.riskLevel === "critical") {
    badgeColor = "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30";
    securityText = "Access Terminated";
  } else if (eligibility.riskLevel === "high") {
    badgeColor = "bg-rose-500/10 text-rose-500 border border-rose-500/20";
    securityText = "Under Verification";
  } else if (eligibility.riskLevel === "medium") {
    badgeColor = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
    securityText = "Elevated Risk Tier";
  }

  const handleClaimButtonClick = () => {
    if (onClaimClick) {
      onClaimClick();
    } else {
      const el = document.getElementById("claim-reward-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card space-y-5">
      {/* Header section with live stream indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-primary" />
          <h2 className="font-display text-sm font-bold">Watch Time & Reward Tracker</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Live streaming status pill */}
          {streamStatus === "streaming" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 animate-pulse">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Streaming Live
            </span>
          ) : streamStatus === "paused" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-500" />
              Stream Paused (Recorded)
            </span>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="size-8 rounded-full hover:bg-secondary"
            title="Refresh tracker"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Real-time Streaming Progression Meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-foreground">
            <Clock className="size-3.5 text-primary" /> Active Verified Watch Time
          </span>
          <span className="text-muted-foreground font-mono">
            {watchMinutes}m {watchSeconds}s / {currentPeriod.requiredMinutes}m
          </span>
        </div>

        <Progress value={currentPeriod.progressPercent} className="h-2.5 rounded-full" />

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{currentPeriod.progressPercent}% of watch requirement</span>
          <span className="flex items-center gap-1">
            <Sparkles className="size-3 text-amber-500" />
            {currentPeriod.formattedTimeRemaining}
          </span>
        </div>
      </div>

      {/* 3-Step Qualification Checklist */}
      <div className="space-y-2.5 rounded-2xl border border-border bg-secondary/20 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-foreground">Claim Reward Requirements</h3>
          <span className="text-[10px] font-medium text-muted-foreground">
            All 3 mandatory to claim
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {/* Requirement 1: Watch Time */}
          <div
            className={`rounded-xl border p-2.5 transition-colors ${
              watchTimeMet
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                : "border-border/80 bg-background/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold flex items-center gap-1.5">
                <Clock
                  className={`size-3.5 ${watchTimeMet ? "text-emerald-500" : "text-primary"}`}
                />
                Watch Time
              </span>
              {watchTimeMet ? (
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              ) : (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {watchMinutes}m/{currentPeriod.requiredMinutes}m
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {watchTimeMet
                ? "60 min threshold reached"
                : `Need ${missingMinutes}m more stream time`}
            </p>
          </div>

          {/* Requirement 2: Like Video */}
          <div
            className={`rounded-xl border p-2.5 transition-colors ${
              likeMet
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                : "border-border/80 bg-background/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold flex items-center gap-1.5">
                <Heart className={`size-3.5 ${likeMet ? "text-emerald-500" : "text-rose-500"}`} />
                Like 1 Video
              </span>
              {likeMet ? (
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              ) : (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {interactives.likes || 0}/1
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {likeMet ? "Liked at least 1 video" : "Like any video on Xora"}
            </p>
          </div>

          {/* Requirement 3: Follow Creator */}
          <div
            className={`rounded-xl border p-2.5 transition-colors ${
              followMet
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                : "border-border/80 bg-background/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold flex items-center gap-1.5">
                <UserPlus
                  className={`size-3.5 ${followMet ? "text-emerald-500" : "text-indigo-500"}`}
                />
                Follow 1 Creator
              </span>
              {followMet ? (
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              ) : (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {interactives.follows || 0}/1
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {followMet ? "Followed at least 1 creator" : "Follow any creator profile"}
            </p>
          </div>
        </div>
      </div>

      {/* Claim Reward Button */}
      <div className="pt-1">
        <Button
          onClick={handleClaimButtonClick}
          className={`w-full h-12 rounded-2xl font-bold text-xs shadow-lift flex items-center justify-center gap-2 ${
            isEligible
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
          }`}
        >
          {isEligible ? (
            <>
              <Sparkles className="size-4 text-amber-400 animate-spin" />
              <span>All Requirements Met — Claim 1GB MTN Reward Now</span>
              <ArrowRight className="size-4 ml-1" />
            </>
          ) : (
            <>
              <Lock className="size-3.5 text-muted-foreground" />
              <span>Claim Reward Section</span>
              <span className="text-[10px] font-normal text-muted-foreground ml-1">
                (
                {!watchTimeMet
                  ? `${missingMinutes}m watch`
                  : !likeMet
                    ? "like 1 video"
                    : "follow 1 creator"}{" "}
                needed)
              </span>
            </>
          )}
        </Button>
      </div>

      {/* Security Trust Score Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/60">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-primary" /> Anti-Fraud Nonce Verification
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${badgeColor}`}>
          {securityText} ({eligibility.trustScore}%)
        </span>
      </div>
    </div>
  );
}
