import { useQuery } from "@tanstack/react-query";
import { LockKeyhole, Radio, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { auth } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";

type AccessResponse = {
  ok: boolean;
  lockEnabled: boolean;
  unlocked: boolean;
  wallUrl?: string;
  error?: string;
};

async function loadAccess(): Promise<AccessResponse> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, lockEnabled: false, unlocked: false, error: "Authentication required." };
  }

  const token = await user.getIdToken();
  const response = await fetch("/api/cpx/live-tv/access", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await response.json()) as AccessResponse;
}

export function CpxLiveTvGate({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const access = useQuery({
    queryKey: ["cpx-live-tv-access", user?.id],
    queryFn: loadAccess,
    enabled: Boolean(user),
    refetchInterval: 5000,
    staleTime: 0,
  });

  if (authLoading || access.isLoading) {
    return (
      <section className="rounded-3xl border border-primary/15 bg-card p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Radio className="size-5 animate-pulse" />
        </div>
        <h2 className="mt-4 font-display text-lg font-semibold">Checking Live TV access…</h2>
        <p className="mt-2 text-sm text-muted-foreground">Preparing your XoraTV Live Channels experience.</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="rounded-3xl border border-primary/15 bg-card p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <LockKeyhole className="size-5" />
        </div>
        <h2 className="mt-4 font-display text-lg font-semibold">Sign in to watch Live TV</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Live Channels access is tied to your XoraTV account.
        </p>
      </section>
    );
  }

  // Testing starts with the CPX dashboard Test Mode enabled, while this XoraTV lock remains optional.
  if (!access.data?.lockEnabled || access.data?.unlocked) return <>{children}</>;

  if (!access.data?.wallUrl) {
    return (
      <section className="rounded-3xl border border-destructive/20 bg-card p-8 text-center shadow-sm">
        <h2 className="font-display text-lg font-semibold">Live TV lock is not configured yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Add the CPX App ID and secure hash to the server environment before enabling the Live Channels lock.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <LockKeyhole className="size-5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">XoraTV Live Channels</p>
            <h1 className="mt-1 font-display text-xl font-semibold">Unlock Live TV access</h1>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          Complete an available CPX Research survey to unlock Live Channels. Your access is granted only after XoraTV receives the server-side CPX completion notification.
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" />
          Your IPTV player remains unchanged; this gate controls access to the Live TV page only.
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <iframe
          src={access.data.wallUrl}
          title="CPX Research"
          className="h-[min(78vh,900px)] w-full border-0"
          allow="clipboard-write; fullscreen"
        />
      </div>
    </section>
  );
}
