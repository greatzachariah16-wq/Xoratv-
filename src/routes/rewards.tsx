import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gift,
  HelpCircle,
  Info,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
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
import { EngagementAnalyticsCard } from "@/components/rewards/EngagementAnalyticsCard";

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

function RewardsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [statusData, setStatusData] = useState<UserRewardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTxId, setActiveTxId] = useState<string | null>(null);
  const [engagementEligible, setEngagementEligible] = useState(false);

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
                  "We couldn't deliver your reward. Your claim will be reviewed automatically.",
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
        toast.success(json.message || "Reward claim received! Processing delivery...");
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
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Badge */}
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
            <Gift className="size-4" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Viewer Appreciation
          </span>
        </div>

        {/* Hero Banner */}
        <div className="mt-3 relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-background to-secondary/30 border border-primary/20 p-6 sm:p-10 shadow-card">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" />
              <span>Promotional Reward</span>
            </div>

            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              1GB MTN Mobile Data Reward
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Stream genuine horror and indie cinema on XoraTV and get rewarded with automated
              mobile data directly delivered to your Nigerian MTN line.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-2.5 py-1.5 border border-border">
                <Wifi className="size-3.5 text-primary" /> MTN Nigeria Lines
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-2.5 py-1.5 border border-border">
                <ShieldCheck className="size-3.5 text-emerald-500" /> Automated Telco Fulfillment
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-background/80 px-2.5 py-1.5 border border-border">
                <Clock className="size-3.5 text-amber-500" /> 30-Day Validity
              </span>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <RewardPopup
                trigger={
                  <Button className="rounded-full px-5 text-xs font-semibold shadow-lift">
                    <Gift className="size-3.5 mr-1.5" /> Open Quick Claim Popup
                  </Button>
                }
              />
            </div>
          </div>
        </div>

        {/* Auth Gate if Guest */}
        {!user && !authLoading && (
          <div className="mt-8 rounded-3xl border border-border bg-card p-8 text-center shadow-card">
            <Lock className="mx-auto size-10 text-primary" />
            <h2 className="mt-4 font-display text-xl font-bold">Sign In to Claim Rewards</h2>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
              Mobile data rewards are exclusively allocated to registered Xora viewers. Create a
              free account or sign in to verify your streaming activity.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button asChild className="rounded-full px-6">
                <Link to="/auth">Sign In / Register</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Authenticated Claim Experience */}
        {user && (
          <div className="mt-8 grid gap-8 lg:grid-cols-12">
            {/* Left Column: Claim Action Form */}
            <div className="lg:col-span-7 space-y-6">
              {/* Delivery Celebration Card */}
              {isDelivered && (
                <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 sm:p-7 text-emerald-950 dark:text-emerald-100 shadow-card">
                  <div className="flex items-start gap-4">
                    <div className="grid size-10 place-items-center rounded-2xl bg-emerald-500 text-white shrink-0">
                      <CheckCircle2 className="size-6" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold">Reward Delivered!</h2>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        Your 1GB MTN data reward has been successfully dispatched to{" "}
                        <strong className="text-foreground">{latestClaim.phoneMasked}</strong>.
                        Check your MTN balance by dialing{" "}
                        <code className="font-mono bg-background px-1 py-0.5 rounded text-[11px]">
                          *310#
                        </code>{" "}
                        or via MyMTN.
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
                <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 sm:p-7 shadow-card">
                  <div className="flex items-start gap-4">
                    <div className="grid size-10 place-items-center rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                      <RefreshCw className="size-5 animate-spin" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold text-amber-950 dark:text-amber-100">
                        Fulfillment in Progress
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        Your reward request has been submitted to the MTN telco gateway for{" "}
                        <strong className="text-foreground">
                          {latestClaim?.phoneMasked || maskPhone(phoneInput)}
                        </strong>
                        . Deliveries typically conclude within 30 to 120 seconds.
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="size-2 rounded-full bg-amber-500 animate-ping" />
                        <span className="text-[11px] font-mono text-muted-foreground">
                          Listening for telco webhook confirmation...
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Review / Failed State Card */}
              {isFailed && !canClaim && (
                <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-950 dark:text-rose-100 shadow-card">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="size-6 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <h2 className="font-display text-base font-bold">Claim Under Review</h2>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        We couldn't deliver your reward. Your claim will be reviewed automatically
                        by our platform operations team.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Claim Card */}
              <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-card">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <h2 className="font-display text-lg font-bold">Claim Your Data</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Input your Nigerian MTN phone number to receive your data.
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {statusData?.rewardDataSize || "1GB"} Allocation
                  </span>
                </div>

                {canClaim ? (
                  <form onSubmit={handleClaim} className="mt-5 space-y-4">
                    <div>
                      <Label htmlFor="claim-phone" className="text-xs font-semibold">
                        Nigerian MTN Mobile Number
                      </Label>
                      <div className="relative mt-1.5">
                        <Smartphone className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
                        <Input
                          id="claim-phone"
                          type="tel"
                          placeholder="e.g. 08031234567 or 08141234567"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          className="h-11 pl-10 rounded-2xl text-sm font-mono tracking-wider"
                          autoComplete="tel"
                          required
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
                                  MTN number. Promo is currently MTN-only.
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

                    <div className="rounded-2xl bg-secondary/50 p-3.5 text-xs text-muted-foreground space-y-1">
                      <p className="font-semibold text-foreground">Important Delivery Notes:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                        <li>Only genuine normal viewer accounts are eligible.</li>
                        <li>Do Not Disturb (DND) status on your line will not block this data.</li>
                        <li>Single reward allocation per viewer for this promotional phase.</li>
                      </ul>
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting || !isValidPhone || !isMtn}
                      className="w-full h-11 rounded-full font-semibold text-xs shadow-lift"
                    >
                      {isSubmitting ? "Submitting to Telco..." : "Claim 1GB MTN Data Now"}
                    </Button>
                  </form>
                ) : (
                  <div className="mt-5 py-6 text-center text-xs text-muted-foreground">
                    {statusData?.hasReachedLimit ? (
                      <div>
                        <CheckCircle2 className="mx-auto size-8 text-emerald-500" />
                        <p className="mt-2 font-semibold text-sm text-foreground">
                          Promotional Quota Complete
                        </p>
                        <p className="mt-1 max-w-sm mx-auto">
                          You have claimed your allotted 1GB MTN data reward for this campaign.
                          Thank you for streaming with XoraTV!
                        </p>
                      </div>
                    ) : isProcessing ? (
                      <p>A claim is currently in progress. Please wait for confirmation.</p>
                    ) : (
                      <p>Rewards are currently paused or being updated. Please check back later.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Policy & Claims History */}
            <div className="lg:col-span-5 space-y-6">
              {/* Real-time Engagement Analytics & Reward Integrity Component */}
              <EngagementAnalyticsCard
                userId={user.id}
                onEligibilityChange={setEngagementEligible}
              />

              {/* Previous Claims History */}
              <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <h2 className="font-display text-sm font-bold">Your Claim History</h2>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {statusData?.transactions.length ?? 0} total
                  </span>
                </div>

                <div className="mt-3 divide-y divide-border/60">
                  {statusData?.transactions && statusData.transactions.length > 0 ? (
                    statusData.transactions.map((tx) => (
                      <div key={tx.xoraTxId} className="py-2.5 text-xs">
                        <div className="flex items-center justify-between font-medium">
                          <span>{tx.planName}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              tx.status === "success"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : tx.status === "failed"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {tx.status}
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
              <div className="rounded-3xl border border-border/70 bg-secondary/30 p-5 text-xs text-muted-foreground space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <HelpCircle className="size-3.5 text-primary" />
                  <span>Promotional Reward Policy</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  The 1GB data reward is a promotional benefit subject to telco network uptime,
                  platform integrity verification, and daily budget limits. It is not an
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
