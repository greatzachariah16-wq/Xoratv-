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
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface EngagementStatus {
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
  eligibility: {
    eligibleToClaim: boolean;
    ineligibilityReason: string | null;
    trustScore: number;
    riskLevel: "low" | "medium" | "high" | "critical";
  };
}

interface EngagementAnalyticsCardProps {
  userId: string;
  onEligibilityChange?: (eligible: boolean) => void;
}

export function EngagementAnalyticsCard({
  userId,
  onEligibilityChange,
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
          onEligibilityChange(json.eligibility.eligibleToClaim);
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
    fetchStatus();
  }, [fetchStatus]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchStatus();
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
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-xl" />
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

  const { currentPeriod, eligibility, interactives } = data;
  const isEligible = eligibility.eligibleToClaim;

  // Formatting hours and minutes of watch time
  const watchMinutes = Math.floor(currentPeriod.verifiedWatchTimeSeconds / 60);
  const watchSeconds = currentPeriod.verifiedWatchTimeSeconds % 60;

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

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card space-y-5">
      {/* Header section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-primary" />
          <h2 className="font-display text-sm font-bold">Xora Reward Integrity</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="size-8 rounded-full hover:bg-secondary"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Real-Time Security Trust Meter */}
      <div className="rounded-2xl border border-border bg-secondary/30 p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium flex items-center gap-1">
            Security Trust Score
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
            {securityText} ({eligibility.trustScore}%)
          </span>
        </div>
        {eligibility.riskLevel !== "low" && (
          <div className="text-[10px] text-muted-foreground flex items-start gap-1.5 leading-relaxed">
            <ShieldAlert className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Multi-device activity patterns detected. Streaming data is subject to security holding
              times.
            </span>
          </div>
        )}
      </div>

      {/* Real-time Streaming Progression Meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-foreground">
            <Clock className="size-3.5 text-primary" /> Verified Stream Progress
          </span>
          <span className="text-muted-foreground font-mono">
            {watchMinutes}m {watchSeconds}s / {currentPeriod.requiredMinutes}m
          </span>
        </div>

        <Progress value={currentPeriod.progressPercent} className="h-2 rounded-full" />

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{currentPeriod.progressPercent}% of goal reached</span>
          <span className="flex items-center gap-1">
            <Sparkles className="size-3 text-amber-500 animate-pulse" />
            {currentPeriod.formattedTimeRemaining}
          </span>
        </div>
      </div>

      {/* Interactive Engagement Analytics */}
      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Active Engagement Trails
        </h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-2.5">
            <Heart className="size-3.5 text-rose-500 mx-auto mb-1" />
            <span className="block text-xs font-bold font-mono">{interactives.likes}</span>
            <span className="text-[9px] text-muted-foreground">Likes</span>
          </div>
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-2.5">
            <MessageSquare className="size-3.5 text-sky-500 mx-auto mb-1" />
            <span className="block text-xs font-bold font-mono">{interactives.comments}</span>
            <span className="text-[9px] text-muted-foreground">Comments</span>
          </div>
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-2.5">
            <Share2 className="size-3.5 text-emerald-500 mx-auto mb-1" />
            <span className="block text-xs font-bold font-mono">{interactives.shares}</span>
            <span className="text-[9px] text-muted-foreground">Shares</span>
          </div>
          <div className="rounded-xl border border-border/80 bg-secondary/20 p-2.5">
            <UserPlus className="size-3.5 text-indigo-500 mx-auto mb-1" />
            <span className="block text-xs font-bold font-mono">{interactives.follows}</span>
            <span className="text-[9px] text-muted-foreground">Follows</span>
          </div>
        </div>
      </div>

      {/* Eligibility Status Alert Block */}
      <div
        className={`rounded-2xl p-3.5 text-xs ${
          isEligible
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-950 dark:text-emerald-100"
            : "bg-amber-500/10 border border-amber-500/20 text-amber-950 dark:text-amber-100"
        }`}
      >
        <div className="flex items-start gap-2">
          {isEligible ? (
            <ShieldCheck className="size-4.5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <Info className="size-4.5 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <p className="font-bold">
              {isEligible ? "Qualification Verified" : "Qualification Pending"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isEligible
                ? "You have completed your stream quota. Secure rewards are now claimable!"
                : eligibility.ineligibilityReason || "Keep watching horror and indie streams."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
