import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Gift,
  Heart,
  HelpCircle,
  History,
  Info,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  UserPlus,
  Wifi,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/xora/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import {
  isMtnNigeriaNumber,
  isValidNigerianPhone,
  maskPhone,
  normalizeNigerianPhone,
} from "@/lib/rewards/phone";
import { RewardPopup } from "@/components/rewards/RewardPopup";
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";
import {
  EngagementAnalyticsCard,
  type EngagementStatus,
} from "@/components/rewards/EngagementAnalyticsCard";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [
      { title: "Viewer Rewards — XoraTV" },
      {
        name: "description",
        content:
          "Claim your promotional 1GB MTN mobile data reward for genuine active streaming on XoraTV.",
      },
    ],
  }),
  component: RewardsPage,
});

interface UserRewardStatus {
  ok: boolean;
  canClaim: boolean;
  hasReachedLimit: boolean;
  rewardDataSize: string;
  planName: string;
  maxRewardsPerUser: number;
  claimCount: number;
  transactions: {
    xoraTxId: string;
    planName: string;
    phoneMasked: string;
    status: "pending" | "processing" | "success" | "failed";
    createdAt: string;
    completedAt?: string | null;
  }[];
  latestClaim?: {
    xoraTxId: string;
    status: "pending" | "processing" | "success" | "failed";
    phoneMasked: string;
    createdAt: string;
    completedAt?: string | null;
  } | null;
}

type MobileSection = "claim" | "requirements" | "history";

function RewardsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [statusData, setStatusData] = useState<UserRewardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTxId, setActiveTxId] = useState<string | null>(null);
  const [engagementEligible, setEngagementEligible] = useState(false);
  const [engagementStatus, setEngagementStatus] = useState<EngagementStatus | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileSection>("claim");

  // Validation states
  const normalizedPhone = normalizeNigerianPhone(phoneInput);
  const isValidPhone = isValidNigerianPhone(normalizedPhone);
  const isMtn = isMtnNigeriaNumber(normalizedPhone);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/rewards/user-status?userId=${encodeURIComponent(user.id)}`);
      if (res.ok) {
        const json = (await res.json()) as UserRewardStatus;
        setStatusData(json);

        // If there's an in-flight claim, track it
        if (
          json.latestClaim &&
          (json.latestClaim.status === "pending" || json.latestClaim.status === "processing")
        ) {
          setActiveTxId(json.latestClaim.xoraTxId);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Status polling when a claim is processing
  useEffect(() => {
    if (!activeTxId) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rewards/tx-status?txId=${encodeURIComponent(activeTxId)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.ok && json.status) {
            if (json.status === "success" || json.status === "failed") {
              setActiveTxId(null);
              clearInterval(interval);
              void fetchStatus();
              if (json.status === "success") {
                toast.success("Your data reward has been delivered!");
              } else {
                toast.error(
                  "We couldn't deliver your reward. You can retry with our verified MTN SME route.",
                );
              }
            }
          }
        }
      } catch {
        // ignore poll blip
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeTxId, fetchStatus]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("Please sign in to your Xora account to claim your reward.");
      return;
    }

    if (!isValidPhone) {
      toast.error("Please enter a valid 11-digit Nigerian phone number.");
      return;
    }

    if (!isMtn) {
      toast.error("The promotional reward is currently available only for MTN Nigeria numbers.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          userEmail: user.email || undefined,
          phone: normalizedPhone,
          trustScore: 90,
          fraudTier: 0,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        toast.success(json.message || "Reward claim received! Dispatched to MTN gateway...");
        setPhoneInput("");
        if (json.txId) {
          setActiveTxId(json.txId);
        }
        await fetchStatus();
      } else {
        toast.error(json.message || "Unable to claim reward at this time.");
      }
    } catch {
      toast.error("Network error while submitting reward claim. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToSection = (id: string, tab: MobileSection) => {
    setActiveMobileTab(tab);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const latestClaim = statusData?.latestClaim;
  const isDelivered = latestClaim?.status === "success";
  const isProcessing =
    latestClaim?.status === "processing" ||
    latestClaim?.status === "pending" ||
    Boolean(activeTxId);
  const isFailed = latestClaim?.status === "failed";
  const canClaim = Boolean(
    statusData?.canClaim && engagementEligible && !isProcessing && !statusData?.hasReachedLimit,
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        {/* Mobile Sticky Quick-Navigation Bar */}
        <div className="sticky top-14 z-30 -mx-3 mb-4 flex items-center justify-between border-y border-border/80 bg-background/95 px-3 py-2 backdrop-blur-md lg:hidden">
          <div className="flex w-full items-center justify-around gap-1">
            <button
              onClick={() => scrollToSection("claim-reward-section", "claim")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold transition-all ${
                activeMobileTab === "claim"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <Gift className="size-3.5" />
              <span>Claim</span>
            </button>
            <button
              onClick={() => scrollToSection("requirements-section", "requirements")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold transition-all ${
                activeMobileTab === "requirements"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <TrendingUp className="size-3.5" />
              <span>Progress</span>
            </button>
            <button
              onClick={() => scrollToSection("history-section", "history")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold transition-all ${
                activeMobileTab === "history"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <History className="size-3.5" />
              <span>History</span>
            </button>
          </div>
        </div>

        {/* Header Badge */}
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary sm:size-8 sm:rounded-xl">
            <Gift className="size-3.5 sm:size-4" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary sm:text-[11px]">
            Viewer Appreciation
          </span>
        </div>

        {/* Hero Banner — Mobile Optimized */}
        <div className="mt-2.5 relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-background to-secondary/30 border border-primary/20 p-4 sm:rounded-3xl sm:p-8 shadow-card">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary sm:px-3 sm:py-1 sm:text-xs">
              <Sparkles className="size-3 sm:size-3.5" />
              <span>Promotional Reward</span>
            </div>

            <h1 className="mt-2.5 font-display text-2xl font-bold tracking-tight sm:mt-4 sm:text-4xl lg:text-5xl">
              {statusData?.planName || "MTN Mobile Data Reward"}
            </h1>

            <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:mt-3 sm:text-sm sm:leading-relaxed">
              Stream genuine horror and indie cinema on XoraTV and get rewarded with automated
              mobile data directly delivered to your Nigerian MTN line.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground sm:mt-6 sm:text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-2 py-1 border border-border sm:px-2.5 sm:py-1.5">
                <Wifi className="size-3 text-primary sm:size-3.5" /> MTN Nigeria Lines
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-2 py-1 border border-border sm:px-2.5 sm:py-1.5">
                <ShieldCheck className="size-3 text-emerald-500 sm:size-3.5" /> Verified Telco
                Gateway
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-2 py-1 border border-border sm:px-2.5 sm:py-1.5">
                <Clock className="size-3 text-amber-500 sm:size-3.5" /> 30-Day Validity
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2.5 sm:mt-6">
              <RewardPopup
                trigger={
                  <Button className="h-9 rounded-full px-4 text-xs font-semibold shadow-lift sm:h-10 sm:px-5">
                    <Gift className="size-3.5 mr-1.5" /> Open Quick Claim Popup
                  </Button>
                }
              />
              <button
                onClick={() => scrollToSection("claim-reward-section", "claim")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline sm:hidden"
              >
                Jump to Form <ArrowRight className="size-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Auth Gate if Guest */}
        {!user && !authLoading && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center sm:rounded-3xl sm:p-8 shadow-card">
            <Lock className="mx-auto size-8 text-primary sm:size-10" />
            <h2 className="mt-3 font-display text-lg font-bold sm:mt-4 sm:text-xl">
              Sign In to Claim Rewards
            </h2>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground leading-relaxed">
              Mobile data rewards are exclusively allocated to registered Xora viewers. Create a
              free account or sign in to verify your streaming activity.
            </p>
            <div className="mt-5 flex justify-center gap-3 sm:mt-6">
              <Button asChild className="h-10 rounded-full px-6 text-xs font-semibold">
                <Link to="/auth">Sign In / Register</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Authenticated Claim Experience */}
        {user && (
          <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-12 lg:gap-8">
            {/* Left Column: Claim Action Form */}
            <div className="lg:col-span-7 space-y-5 sm:space-y-6">
              {/* Delivery Celebration Card */}
              {isDelivered && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 sm:rounded-3xl sm:p-7 text-emerald-950 dark:text-emerald-100 shadow-card">
                  <div className="flex items-start gap-3.5 sm:gap-4">
                    <div className="grid size-9 place-items-center rounded-xl bg-emerald-500 text-white shrink-0 sm:size-10 sm:rounded-2xl">
                      <CheckCircle2 className="size-5 sm:size-6" />
                    </div>
                    <div>
                      <h2 className="font-display text-base font-bold sm:text-lg">
                        Reward Delivered!
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        Your {statusData?.rewardDataSize || "MTN"} data reward has been successfully
                        dispatched to{" "}
                        <strong className="text-foreground">{latestClaim.phoneMasked}</strong>.
                        Check your MTN balance by dialing{" "}
                        <code className="font-mono bg-background px-1 py-0.5 rounded text-[11px]">
                          *310#
                        </code>{" "}
                        or via MyMTN app.
                      </p>
                      {latestClaim.completedAt && (
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          Delivered: {new Date(latestClaim.completedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* In-Flight Processing Card */}
              {isProcessing && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 sm:rounded-3xl sm:p-7 shadow-card">
                  <div className="flex items-start gap-3.5 sm:gap-4">
                    <div className="grid size-9 place-items-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 sm:size-10 sm:rounded-2xl">
                      <RefreshCw className="size-5 animate-spin" />
                    </div>
                    <div>
                      <h2 className="font-display text-base font-bold text-amber-950 dark:text-amber-100 sm:text-lg">
                        Fulfillment in Progress
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        Your reward request has been submitted to the MTN telco gateway for{" "}
                        <strong className="text-foreground">
                          {latestClaim?.phoneMasked || maskPhone(phoneInput)}
                        </strong>
                        . Telco dispatches typically conclude within 30 to 120 seconds.
                      </p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className="size-2 rounded-full bg-amber-500 animate-ping" />
                        <span className="text-[11px] font-mono text-muted-foreground">
                          Listening for telco gateway delivery confirmation...
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Telco Route Recovery Notice (If previous attempt hit upstream glitch) */}
              {isFailed && !isProcessing && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:rounded-3xl sm:p-6 shadow-card">
                  <div className="flex items-start gap-3">
                    <RotateCcw className="size-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h2 className="font-display text-xs font-bold text-foreground sm:text-sm">
                        Previous Delivery Attempt Glitch
                      </h2>
                      <p className="text-[11px] text-muted-foreground leading-relaxed sm:text-xs">
                        {latestClaim?.errorMessage ||
                          "The previous attempt encountered a temporary carrier gateway glitch."}{" "}
                        Your reward allocation was not deducted. You can submit your MTN number
                        below to retry.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Claim Card */}
              <div
                id="claim-reward-section"
                className="rounded-2xl border border-border bg-card p-4 sm:rounded-3xl sm:p-7 lg:p-8 shadow-card scroll-mt-28"
              >
                <div className="flex items-center justify-between border-b border-border pb-3.5 sm:pb-4">
                  <div>
                    <h2 className="font-display text-base font-bold sm:text-lg">Claim Your Data</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Input your Nigerian MTN number to receive{" "}
                      {statusData?.rewardDataSize || "1GB"} mobile data.
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary sm:px-3 sm:py-1 sm:text-xs">
                    {statusData?.rewardDataSize || "1GB"} Allocation
                  </span>
                </div>

                {statusData?.hasReachedLimit ? (
                  <div className="mt-5 py-6 text-center text-xs text-muted-foreground">
                    <CheckCircle2 className="mx-auto size-8 text-emerald-500" />
                    <p className="mt-2 font-semibold text-sm text-foreground">
                      Promotional Quota Complete
                    </p>
                    <p className="mt-1 max-w-sm mx-auto">
                      You have claimed your allotted 1GB MTN data reward for this campaign. Thank
                      you for streaming with XoraTV!
                    </p>
                  </div>
                ) : isProcessing ? (
                  <div className="mt-5 py-6 text-center text-xs text-muted-foreground">
                    <RefreshCw className="mx-auto size-8 text-amber-500 animate-spin" />
                    <p className="mt-2 font-semibold text-sm text-foreground">Claim in Progress</p>
                    <p className="mt-1 max-w-sm mx-auto">
                      Your reward request is being fulfilled by the telco gateway. Please wait for
                      confirmation.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleClaim} className="mt-4 space-y-4 sm:mt-5">
                    {/* Live Criteria Progress Checklist inside Claim Section */}
                    <div className="rounded-xl border border-border bg-secondary/30 p-3 sm:rounded-2xl sm:p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                          <Flame className="size-3.5 text-primary" /> Claim Qualification
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase sm:text-[10px] ${
                            canClaim
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {canClaim ? "Qualified to Claim" : "Requirements Incomplete"}
                        </span>
                      </div>

                      {/* Responsive Grid for Criteria */}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {/* Watch Time Status */}
                        {(() => {
                          const watchSeconds =
                            engagementStatus?.currentPeriod.verifiedWatchTimeSeconds ?? 0;
                          const reqSeconds =
                            engagementStatus?.currentPeriod.requiredSeconds ?? 3600;
                          const watchMins = Math.floor(watchSeconds / 60);
                          const reqMins = Math.round(reqSeconds / 60);
                          const met = watchSeconds >= reqSeconds;
                          return (
                            <div
                              className={`rounded-lg border p-2 sm:rounded-xl sm:p-2.5 ${
                                met
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                                  : "border-border/80 bg-background/50"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[11px] flex items-center gap-1">
                                  <Clock className="size-3 text-primary" /> Watch Time
                                </span>
                                {met ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                                ) : (
                                  <XCircle className="size-3.5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="mt-1 flex items-center justify-between">
                                <span className="font-mono text-[11px]">
                                  {watchMins}m / {reqMins}m
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {met ? "Complete" : `${Math.max(0, reqMins - watchMins)}m left`}
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Like Video Status */}
                        {(() => {
                          const likes =
                            engagementStatus?.interactives?.likes ??
                            engagementStatus?.currentPeriod?.likeCount ??
                            0;
                          const met = likes >= 1;
                          return (
                            <div
                              className={`rounded-lg border p-2 sm:rounded-xl sm:p-2.5 ${
                                met
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                                  : "border-border/80 bg-background/50"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[11px] flex items-center gap-1">
                                  <Heart className="size-3 text-rose-500" /> Video Like
                                </span>
                                {met ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                                ) : (
                                  <XCircle className="size-3.5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="mt-1 flex items-center justify-between">
                                <span className="font-mono text-[11px]">
                                  {likes >= 1 ? "1 / 1" : "0 / 1"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {met ? "Complete" : "1 needed"}
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Follow Creator Status */}
                        {(() => {
                          const follows =
                            engagementStatus?.interactives?.follows ??
                            engagementStatus?.currentPeriod?.followCount ??
                            0;
                          const met = follows >= 1;
                          return (
                            <div
                              className={`rounded-lg border p-2 sm:rounded-xl sm:p-2.5 ${
                                met
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                                  : "border-border/80 bg-background/50"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[11px] flex items-center gap-1">
                                  <UserPlus className="size-3 text-indigo-500" /> Follow Creator
                                </span>
                                {met ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                                ) : (
                                  <XCircle className="size-3.5 text-muted-foreground" />
                                )}
                              </div>
                              <div className="mt-1 flex items-center justify-between">
                                <span className="font-mono text-[11px]">
                                  {follows >= 1 ? "1 / 1" : "0 / 1"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {met ? "Complete" : "1 needed"}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Explicit Warning & Direct Action Links when Requirements are not met */}
                      {!canClaim && (
                        <div className="pt-1.5 space-y-2">
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium leading-relaxed">
                            {engagementStatus?.eligibility?.ineligibilityReason ||
                              "Please complete all 3 requirements to claim: 60m watch time, at least 1 video liked, and at least 1 creator followed."}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-8 text-[11px] rounded-lg border-primary/30 hover:bg-primary/10"
                            >
                              <Link to="/">Stream Video</Link>
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-8 text-[11px] rounded-lg border-primary/30 hover:bg-primary/10"
                            >
                              <Link to="/shorts">Like Video</Link>
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-8 text-[11px] rounded-lg border-primary/30 hover:bg-primary/10"
                            >
                              <Link to="/learn">Follow Creator</Link>
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="claim-phone" className="text-xs font-semibold">
                        Nigerian MTN Mobile Number
                      </Label>
                      <div className="relative mt-1.5">
                        <Smartphone className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
                        <Input
                          id="claim-phone"
                          type="tel"
                          inputMode="tel"
                          placeholder="e.g. 08031234567 or 08141234567"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          className="h-11 pl-10 rounded-xl sm:rounded-2xl text-sm font-mono tracking-wider"
                          autoComplete="tel"
                          required
                          disabled={!canClaim}
                        />
                      </div>

                      {/* Dynamic validation helper */}
                      <div className="mt-2 text-[11px]">
                        {phoneInput.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            {isValidPhone ? (
                              isMtn ? (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                                  <CheckCircle2 className="size-3.5" /> Valid MTN Nigeria line
                                  detected ({normalizedPhone})
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                  <AlertCircle className="size-3.5" /> This does not appear to be an
                                  MTN number. Promotional data is currently MTN-only.
                                </span>
                              )
                            ) : (
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Info className="size-3.5" /> Enter standard 11 digits (080...,
                                081..., 090..., 070...)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl bg-secondary/50 p-3 sm:rounded-2xl sm:p-3.5 text-xs text-muted-foreground space-y-1">
                      <p className="font-semibold text-foreground text-[11px] sm:text-xs">
                        Delivery Information:
                      </p>
                      <ul className="list-disc list-inside space-y-0.5 text-[10px] sm:text-[11px]">
                        <li>Delivered directly to your MTN balance via verified telco gateway.</li>
                        <li>Do Not Disturb (DND) status will not block this data reward.</li>
                        <li>One claim per viewer account for this promotional phase.</li>
                      </ul>
                    </div>

                    {/* Claim Button: disabled until all requirements are met! */}
                    <Button
                      type="submit"
                      disabled={!canClaim || isSubmitting || !isValidPhone || !isMtn}
                      className={`w-full h-11 sm:h-12 rounded-full font-semibold text-xs sm:text-sm shadow-lift ${
                        !canClaim ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="size-4 animate-spin" /> Submitting to Telco
                          Gateway...
                        </span>
                      ) : !canClaim ? (
                        <>
                          <Lock className="size-3.5 mr-1.5" />
                          Claim Reward (Requirements Pending)
                        </>
                      ) : (
                        `Claim ${statusData?.rewardDataSize || "1GB"} MTN Data Now`
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </div>

            {/* Right Column: Policy & Claims History */}
            <div className="lg:col-span-5 space-y-5 sm:space-y-6">
              {/* Real-time Engagement Analytics & Reward Integrity Component */}
              <div id="requirements-section" className="scroll-mt-28">
                <EngagementAnalyticsCard
                  userId={user.id}
                  onEligibilityChange={(eligible, status) => {
                    setEngagementEligible(eligible);
                    if (status) setEngagementStatus(status);
                  }}
                  onClaimClick={() => scrollToSection("claim-reward-section", "claim")}
                />
              </div>

              {/* Previous Claims History */}
              <div
                id="history-section"
                className="rounded-2xl border border-border bg-card p-4 sm:rounded-3xl sm:p-6 shadow-card scroll-mt-28"
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <h2 className="font-display text-sm font-bold flex items-center gap-1.5">
                    <History className="size-4 text-primary" /> Your Claim History
                  </h2>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {statusData?.transactions.length ?? 0} total
                  </span>
                </div>

                <div className="mt-3 divide-y divide-border/60">
                  {statusData?.transactions && statusData.transactions.length > 0 ? (
                    statusData.transactions.map((tx) => (
                      <div key={tx.xoraTxId} className="py-2.5 text-xs">
                        <div className="flex items-center justify-between font-medium">
                          <span className="truncate pr-2">{tx.planName}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 ${
                              tx.status === "success"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : tx.status === "failed"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {tx.status === "failed" ? "retryable" : tx.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{tx.phoneMasked}</span>
                          <span>
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "—"}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-[11px] text-muted-foreground">
                      No claims recorded yet.
                    </p>
                  )}
                </div>
              </div>

              {/* In-House Partner Promotion */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" /> Sponsored Partner
                  </span>
                  <span className="text-[10px] text-muted-foreground">Featured</span>
                </div>
                <XoraInHouseAd placement="reward_popup" variant="card" />
              </div>

              {/* Policy Disclaimer */}
              <div className="rounded-2xl border border-border/70 bg-secondary/30 p-4 sm:rounded-3xl sm:p-5 text-xs text-muted-foreground space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <HelpCircle className="size-3.5 text-primary" />
                  <span>Promotional Reward Policy</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  The 1GB data reward is a promotional viewer benefit subject to telco network
                  uptime, platform integrity verification, and daily budget limits. It is not an
                  unconditional guarantee.
                </p>
                <div className="pt-1">
                  <Link
                    to="/privacy"
                    hash="terms"
                    className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Read full terms in Privacy & Promotion Policy{" "}
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
