import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Gift,
  Info,
  Lock,
  RefreshCw,
  Smartphone,
  Sparkles,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { XoraInHouseAd } from "@/components/ads/XoraInHouseAd";

interface RewardPopupProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

interface UserRewardStatus {
  ok: boolean;
  canClaim: boolean;
  hasReachedLimit: boolean;
  rewardDataSize: string;
  planName: string;
  maxRewardsPerUser: number;
  claimCount: number;
  latestClaim?: {
    xoraTxId: string;
    status: "pending" | "processing" | "success" | "failed";
    phoneMasked: string;
    createdAt: string;
    completedAt?: string | null;
  } | null;
}

export function RewardPopup({ open, onOpenChange, trigger }: RewardPopupProps) {
  const { user, loading: authLoading } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const showModal = isControlled ? open : internalOpen;
  const setModalOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;

  const [statusData, setStatusData] = useState<UserRewardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTxId, setActiveTxId] = useState<string | null>(null);

  // Phone validation
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
        if (
          json.latestClaim &&
          (json.latestClaim.status === "pending" || json.latestClaim.status === "processing")
        ) {
          setActiveTxId(json.latestClaim.xoraTxId);
        }
      }
    } catch {
      // ignore fetch error
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (showModal) {
      void fetchStatus();
    }
  }, [showModal, fetchStatus]);

  // Live polling when a transaction is in flight
  useEffect(() => {
    if (!activeTxId || !showModal) return;

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
                toast.success("1GB MTN Data reward successfully delivered!");
              } else {
                toast.error("Reward delivery encountered an issue. Queued for manual review.");
              }
            }
          }
        }
      } catch {
        // poll error
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeTxId, showModal, fetchStatus]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("Please sign in to claim your reward.");
      return;
    }

    if (!isValidPhone) {
      toast.error("Please enter a valid 11-digit Nigerian phone number.");
      return;
    }

    if (!isMtn) {
      toast.error("Reward is currently reserved for MTN Nigeria lines.");
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
        toast.success(json.message || "Reward claim received! Dispathing to MTN telco gateway...");
        setPhoneInput("");
        if (json.txId) {
          setActiveTxId(json.txId);
        }
        await fetchStatus();
      } else {
        toast.error(json.message || "Unable to process reward at this time.");
      }
    } catch {
      toast.error("Network error while submitting reward claim.");
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
  const canClaim = Boolean(statusData?.canClaim && !isProcessing && !statusData?.hasReachedLimit);

  return (
    <Dialog open={showModal} onOpenChange={setModalOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px] rounded-3xl border-primary/25 bg-[#0f0c18] p-0 shadow-2xl text-foreground">
        {/* Top Header Section */}
        <div className="relative overflow-hidden bg-gradient-to-b from-primary/20 via-primary/5 to-transparent p-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/20 text-primary">
              <Gift className="size-4" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Viewer Appreciation
            </span>
          </div>

          <DialogTitle className="mt-2.5 font-display text-2xl font-bold tracking-tight text-white">
            1GB MTN Data Reward
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Exclusive streaming promotion for active XoraTV viewers. Delivered straight to your
            Nigerian MTN line.
          </DialogDescription>
        </div>

        <div className="p-6 space-y-6">
          {/* Guest / Auth Gate */}
          {!user && !authLoading && (
            <div className="rounded-2xl border border-border/60 bg-secondary/20 p-5 text-center space-y-3">
              <Lock className="mx-auto size-7 text-primary" />
              <p className="text-xs text-muted-foreground">
                Sign in to verify your viewer account and receive your free mobile data reward.
              </p>
              <Button asChild size="sm" className="rounded-full px-5 text-xs font-semibold">
                <Link to="/auth" onClick={() => setModalOpen(false)}>
                  Sign In / Register
                </Link>
              </Button>
            </div>
          )}

          {/* Authenticated Claim Experience */}
          {user && (
            <div className="space-y-4">
              {/* Delivered State */}
              {isDelivered && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="size-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-emerald-200">1GB Data Delivered!</h4>
                      <p className="mt-0.5 text-muted-foreground">
                        Sent to{" "}
                        <strong className="text-foreground">{latestClaim.phoneMasked}</strong>. Dial
                        *310# to verify your balance.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* In-Flight Processing */}
              {isProcessing && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs">
                  <div className="flex items-start gap-3">
                    <RefreshCw className="size-5 text-amber-400 animate-spin shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-amber-200">Delivering Mobile Data...</h4>
                      <p className="mt-0.5 text-muted-foreground">
                        Submitted to MTN telco gateway for{" "}
                        <strong className="text-foreground">
                          {latestClaim?.phoneMasked || maskPhone(phoneInput)}
                        </strong>
                        . Usually takes 30-60 seconds.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Input */}
              {canClaim ? (
                <form onSubmit={handleClaim} className="space-y-3">
                  <div>
                    <Label htmlFor="popup-phone" className="text-xs font-semibold text-foreground">
                      MTN Phone Number
                    </Label>
                    <div className="relative mt-1.5">
                      <Smartphone className="absolute left-3.5 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        id="popup-phone"
                        type="tel"
                        placeholder="0803XXXXXXX"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        className="h-10 pl-10 rounded-xl text-xs font-mono tracking-wider bg-background/50 border-border/80"
                        autoComplete="tel"
                        required
                      />
                    </div>

                    {phoneInput.length > 0 && (
                      <div className="mt-1.5 text-[11px]">
                        {isValidPhone ? (
                          isMtn ? (
                            <span className="text-emerald-400 flex items-center gap-1 font-medium">
                              <CheckCircle2 className="size-3" /> Valid MTN line ({normalizedPhone})
                            </span>
                          ) : (
                            <span className="text-amber-400 flex items-center gap-1">
                              <AlertCircle className="size-3" /> Promotion is for MTN Nigeria
                              numbers only.
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Info className="size-3" /> Enter 11-digit phone number.
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting || !isValidPhone || !isMtn}
                    className="w-full h-10 rounded-xl font-semibold text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-lift"
                  >
                    {isSubmitting ? "Delivering..." : "Claim 1GB MTN Data Now"}
                  </Button>
                </form>
              ) : statusData?.hasReachedLimit ? (
                <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Quota Reached</p>
                  <p className="mt-0.5 text-[11px]">
                    You have claimed your allotted promotional data reward for this phase.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {/* Dedicated In-House Ad Shell Placement */}
          <div className="border-t border-border/40 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1">
                <Sparkles className="size-2.5 text-primary" /> Sponsored Partner
              </span>
              <span className="text-[10px] text-muted-foreground/60">Advertisement</span>
            </div>

            <XoraInHouseAd placement="reward_popup" variant="card" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
