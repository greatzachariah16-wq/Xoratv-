import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isFirebaseConfigured } from "@/integrations/firebase/config";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  checkRedirectAuthResult,
  mapAuthError,
} from "@/integrations/firebase/auth";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/xora/Logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Xora" },
      { name: "description", content: "Sign in or create your Xora account to post and follow." },
      { property: "og:title", content: "Sign in — Xora" },
      { property: "og:description", content: "Join Xora to post, follow and learn." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, redirect to home
  useEffect(() => {
    if (!authLoading && user) {
      void navigate({ to: "/" });
    }
  }, [user, authLoading, navigate]);

  // Check for pending Google sign-in redirect results (mobile browsers)
  useEffect(() => {
    let mounted = true;
    checkRedirectAuthResult()
      .then((profile) => {
        if (mounted && profile) {
          toast.success("Signed in with Google — welcome to Xora");
          void navigate({ to: "/" });
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error("Redirect auth error:", err);
          toast.error(mapAuthError(err));
        }
      });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!username.trim()) {
          toast.error("Please enter a username for your profile.");
          setBusy(false);
          return;
        }
        if (password.length < 6) {
          toast.error("Password must be at least 6 characters long.");
          setBusy(false);
          return;
        }

        if (isFirebaseConfigured()) {
          await signUpWithEmail(email, password, username);
          toast.success("Account created — welcome to Xora");
          void navigate({ to: "/" });
        } else {
          // Local demo session when Firebase is not configured
          localStorage.setItem(
            "xora_demo_user",
            JSON.stringify({
              user: {
                id: "user-" + Date.now(),
                email: email.trim(),
                displayName: username.trim() || email.split("@")[0],
                photoURL: null,
              },
            }),
          );
          toast.success("Account created — welcome to Xora (Demo Mode)");
          window.location.href = "/";
        }
      } else {
        if (isFirebaseConfigured()) {
          await signInWithEmail(email, password);
          toast.success("Welcome back to Xora");
          void navigate({ to: "/" });
        } else {
          localStorage.setItem(
            "xora_demo_user",
            JSON.stringify({
              user: {
                id: "user-returning",
                email: email.trim(),
                displayName: email.split("@")[0],
                photoURL: null,
              },
            }),
          );
          toast.success("Welcome back to Xora (Demo Mode)");
          window.location.href = "/";
        }
      }
    } catch (error) {
      toast.error(mapAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured()) {
      localStorage.setItem(
        "xora_demo_user",
        JSON.stringify({
          user: {
            id: "demo-google-user",
            email: "viewer@xora.tv",
            displayName: "Horror Fan",
            photoURL:
              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
          },
        }),
      );
      toast.success("Signed in with Google (Demo Mode)");
      window.location.href = "/";
      return;
    }

    setGoogleBusy(true);
    try {
      const result = await signInWithGoogle();
      if (result.redirected) {
        // Redirect initiated (e.g. on mobile devices)
        return;
      }
      toast.success("Signed in with Google — welcome to Xora");
      void navigate({ to: "/" });
    } catch (error) {
      console.error("Google sign-in error:", error);
      toast.error(mapAuthError(error));
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="rise w-full max-w-sm">
        <div className="flex justify-center">
          <Link to="/" className="press">
            <Logo />
          </Link>
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to post, follow and comment."
              : "Pick a handle and start sharing."}
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleBusy || busy}
            className="press mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-secondary disabled:opacity-60"
          >
            {googleBusy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Signing in with Google…
              </>
            ) : (
              "Continue with Google"
            )}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" ? (
              <div>
                <label htmlFor="username" className="text-xs font-medium text-muted-foreground">
                  Username
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-zA-Z0-9_]+"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="yourhandle"
                />
              </div>
            ) : null}
            <div>
              <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={busy || googleBusy}
              className="press w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to Xora?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-primary hover:underline"
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>

          <div className="mt-5 flex items-center justify-center gap-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:underline hover:text-foreground">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link to="/privacy" hash="terms" className="hover:underline hover:text-foreground">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
