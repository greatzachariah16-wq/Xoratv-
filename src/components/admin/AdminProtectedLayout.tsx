import { ReactNode } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AppShell } from "@/components/xora/AppShell";
import { AdminLoginGate } from "./AdminLoginGate";
import { AdminHeader } from "./AdminHeader";
import { AdminSecurityBar } from "./AdminSecurityBar";
import { AdminNavigationMenu } from "./AdminNavigationMenu";

interface AdminProtectedLayoutProps {
  title?: string;
  subtitle?: string;
  currentSectionId?: string;
  showBackToDashboard?: boolean;
  children: ReactNode;
  hideSecurityBar?: boolean;
}

export function AdminProtectedLayout({
  title,
  subtitle,
  currentSectionId,
  showBackToDashboard = true,
  children,
  hideSecurityBar = false,
}: AdminProtectedLayoutProps) {
  const {
    isAuthenticated: isAdmin,
    checkingSession,
    sessionInfo,
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
    logout,
    refreshSession,
  } = useAdminAuth();

  if (checkingSession) {
    return (
      <AppShell wide>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs font-mono text-muted-foreground">
              Verifying sovereign administrator authorization...
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
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
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader
        title={title}
        subtitle={subtitle}
        currentSectionId={currentSectionId}
        showBackToDashboard={showBackToDashboard}
      />

      <main className="mx-auto max-w-[1480px] px-4 pb-24 pt-5 sm:px-8 lg:px-10">
        {!hideSecurityBar && (
          <div className="mb-6">
            <AdminSecurityBar
              sessionInfo={sessionInfo}
              onLogout={logout}
              onRefreshSession={refreshSession}
            />
          </div>
        )}

        {children}
      </main>

      {/* Quick Navigation Floating Launcher */}
      <AdminNavigationMenu activeSectionId={currentSectionId} variant="floating" />
    </div>
  );
}
