import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/xora/AppShell";
import { AdcashSwitch } from "@/components/admin/AdcashSwitch";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLoginGate } from "@/components/admin/AdminLoginGate";

export const Route = createFileRoute("/admin/adcash")({
  component: AdcashAdminPage,
});

function AdcashAdminPage() {
  const {
    isAuthenticated,
    checkingSession,
    loginStep,
    setLoginStep,
    isSubmitting,
    errorMessage,
    remainingAttempts,
    isLocked,
    retryAfter,
    verifyPhrases,
    verifyMfa,
    resetLockout,
  } = useAdminAuth();

  if (checkingSession) {
    return <AppShell wide><div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">Verifying administrator session...</div></AppShell>;
  }

  if (!isAuthenticated) {
    return (
      <AppShell wide>
        <AdminLoginGate
          loginStep={loginStep}
          isSubmitting={isSubmitting}
          errorMessage={errorMessage}
          remainingAttempts={remainingAttempts}
          isLocked={isLocked}
          retryAfter={retryAfter}
          onVerifyPhrases={verifyPhrases}
          onVerifyMfa={verifyMfa}
          onResetLockout={resetLockout}
          onBackToPhrases={() => setLoginStep("phrases")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell wide>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold text-foreground">Adcash Controls</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage the Adcash master switch without changing any existing ad network configuration.</p>
        <AdcashSwitch />
      </div>
    </AppShell>
  );
}
