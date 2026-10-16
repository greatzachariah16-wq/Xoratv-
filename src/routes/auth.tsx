import { useEffect, useState, type ReactNode, type InputHTMLAttributes } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, AtSign, Check, Eye, EyeOff, Info, Loader2, Lock, Mail, Play, RotateCw, ShieldCheck, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { isFirebaseConfigured } from "@/integrations/firebase/config";
import { checkRedirectAuthResult, confirmVerifiedEmailAndSignIn, resendVerificationEmail, sendPasswordReset, signInWithGoogle, mapAuthError, signOutCurrentUser, signUpWithEmail } from "@/integrations/firebase/auth";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Join XoraTV — Sign in or create an account" },
    { name: "description", content: "Create your XoraTV account, verify your email and join the community." },
    { property: "og:title", content: "Join XoraTV" },
    { property: "og:description", content: "Watch, share and create on XoraTV." },
    { name: "robots", content: "noindex" },
  ] }),
  component: AuthPage,
});

type Screen = "signup" | "verify" | "signin" | "forgot" | "forgot-sent";
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const maskEmail = (value: string) => {
  const parts = value.split("@");
  const name = parts[0] || "";
  return parts[1] ? name.slice(0, 1) + "•".repeat(Math.max(2, name.length - 1)) + "@" + parts[1] : value;
};

function Brand({ light = false }: { light?: boolean }) {
  return <div className="flex items-center gap-2.5"><div className="xora-auth-mark grid h-10 w-10 place-items-center rounded-xl shadow-card"><Play className="h-4 w-4 translate-x-px fill-current" /></div><span className={"font-display text-xl font-bold tracking-tight " + (light ? "text-white" : "text-foreground")}>Xora<span className="text-primary">TV</span></span></div>;
}
function Field({ label, icon, error, hint, right, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: ReactNode; error?: string; hint?: ReactNode; right?: ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[13px] font-semibold text-foreground">{label}</span><span className={"flex h-11 items-center gap-2 rounded-xl border bg-background px-3 transition focus-within:ring-4 focus-within:ring-ring/15 " + (error ? "border-destructive/70" : "border-input focus-within:border-ring")}>{icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}<input {...props} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/70" />{right}</span>{error && <span className="mt-1.5 flex items-center gap-1 text-xs text-destructive"><X className="h-3 w-3" />{error}</span>}{!error && hint && <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>}</label>;
}
function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>;
}
function PrimaryButton({ children, busy, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button {...props} disabled={busy || props.disabled} className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-card transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{children}</button>;
}
function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="font-semibold text-primary underline-offset-4 hover:underline">{children}</button>;
}
function Notice({ tone = "info", children }: { tone?: "info" | "success" | "error"; children: ReactNode }) {
  const styles = { info: "bg-accent text-accent-foreground", success: "bg-success/10 text-success", error: "bg-destructive/10 text-destructive" };
  const Icon = tone === "success" ? Check : tone === "error" ? X : Info;
  return <div className={"flex gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed " + styles[tone]}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div></div>;
}
function SecurityNote() {
  return <div className="mt-6 flex gap-2.5 rounded-xl border border-border bg-secondary/60 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>Your password is securely handled by <b className="text-foreground">Firebase Authentication</b>. Your XoraTV username is stored separately as your public profile handle.</p></div>;
}
function ScreenHeader({ title, subtitle, back }: { title: string; subtitle: ReactNode; back?: () => void }) {
  return <div className="mb-6">{back && <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back</button>}<h1 className="text-2xl font-semibold text-foreground sm:text-[28px]">{title}</h1><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p></div>;
}

function SignUp({ onScreen, setPending }: { onScreen: (screen: Screen) => void; setPending: (email: string, password: string, username: string) => void }) {
  const [form, setForm] = useState({ first: "", last: "", username: "", email: "", password: "", confirm: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [terms, setTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(old => ({ ...old, [key]: event.target.value }));
  const errors = {
    first: form.first.trim() ? "" : "Enter your first name",
    last: form.last.trim() ? "" : "Enter your last name",
    username: /^[a-z0-9_]{3,24}$/i.test(form.username.trim()) ? "" : "Use 3–24 letters, numbers or underscores",
    email: emailOk(form.email.trim()) ? "" : "Enter a valid email address",
    password: form.password.length >= 8 ? "" : "Use at least 8 characters",
    confirm: form.confirm && form.confirm === form.password ? "" : "Passwords don't match",
    terms: terms ? "" : "Please accept the terms to continue",
  };
  const error = (key: keyof typeof errors) => submitted ? errors[key] : "";
  const strength = [form.password.length >= 8, /[A-Z]/.test(form.password), /\d/.test(form.password), /[^A-Za-z0-9]/.test(form.password)].filter(Boolean).length;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    if (!isFirebaseConfigured()) { toast.error("Account registration is temporarily unavailable. Please try again shortly."); return; }
    setBusy(true);
    try { await signUpWithEmail(form.email, form.password, form.username, form.first, form.last); setPending(form.email.trim().toLowerCase(), form.password, form.username.trim().toLowerCase()); onScreen("verify"); }
    catch (err) { toast.error(mapAuthError(err)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} noValidate>
    <ScreenHeader title="Create your account" subtitle={<>Already on XoraTV? <TextLink onClick={() => onScreen("signin")}>Sign in</TextLink></>} />
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><Field label="First name" placeholder="Amara" value={form.first} onChange={update("first")} error={error("first")} autoComplete="given-name" /><Field label="Last name" placeholder="Okafor" value={form.last} onChange={update("last")} error={error("last")} autoComplete="family-name" /></div>
      <Field label="Username" icon={<AtSign className="h-4 w-4" />} placeholder="amara_creates" value={form.username} onChange={update("username")} error={error("username")} hint="Your public XoraTV handle. Letters, numbers and underscores." autoComplete="username" />
      <Field label="Email" type="email" icon={<Mail className="h-4 w-4" />} placeholder="you@example.com" value={form.email} onChange={update("email")} error={error("email")} autoComplete="email" />
      <div><Field label="Password" type={showPassword ? "text" : "password"} icon={<Lock className="h-4 w-4" />} placeholder="At least 8 characters" value={form.password} onChange={update("password")} error={error("password")} right={<PasswordToggle show={showPassword} onToggle={() => setShowPassword(!showPassword)} />} autoComplete="new-password" />{form.password && <div className="mt-2 flex gap-1">{[0,1,2,3].map(item => <span key={item} className={"h-1 flex-1 rounded-full " + (item < strength ? (strength >= 3 ? "bg-success" : "bg-primary") : "bg-border")} />)}</div>}</div>
      <Field label="Confirm password" type={showConfirm ? "text" : "password"} icon={<Lock className="h-4 w-4" />} placeholder="Re-enter password" value={form.confirm} onChange={update("confirm")} error={error("confirm")} right={<PasswordToggle show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />} autoComplete="new-password" />
      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-muted-foreground"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" /><span>I agree to XoraTV's <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">Terms</Link> and <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">Privacy Policy</Link>.</span></label>
      {error("terms") && <p className="-mt-2 text-xs text-destructive">{error("terms")}</p>}
      <PrimaryButton type="submit" busy={busy}>Create account</PrimaryButton>
    </div><SecurityNote />
  </form>;
}

function VerifyEmail({ email, username, password, onScreen }: { email: string; username: string; password: string; onScreen: (screen: Screen) => void }) {
  const [countdown, setCountdown] = useState(30);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  useEffect(() => { if (countdown <= 0) return; const timer = setTimeout(() => setCountdown(value => value - 1), 1000); return () => clearTimeout(timer); }, [countdown]);
  const resend = async () => {
    setBusy(true);
    try { await resendVerificationEmail(email, password); setResent(true); setCountdown(30); toast.success("Verification email sent. Check your inbox."); }
    catch (err) { toast.error(mapAuthError(err)); }
    finally { setBusy(false); }
  };
  const continueAfterVerification = async () => {
    setBusy(true);
    try {
      await confirmVerifiedEmailAndSignIn(email, username, password);
      toast.success("Email verified. Welcome to XoraTV!");
      window.location.assign("/");
    } catch (err) { toast.error(mapAuthError(err)); }
    finally { setBusy(false); }
  };
  return <div><div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-accent"><Mail className="h-6 w-6 text-primary" /></div><ScreenHeader title="Check your inbox" subtitle={<>We sent a verification link to <b className="text-foreground">{maskEmail(email)}</b>. Open it to activate your account.</>} /><div className="space-y-3"><Notice><b>Email verification is required.</b> You must confirm your address before entering XoraTV.</Notice>{resent && <Notice tone="success">A new verification link has been sent.</Notice>}</div><div className="mt-6 space-y-3"><PrimaryButton type="button" busy={busy} onClick={continueAfterVerification}>I've verified my email</PrimaryButton><button type="button" disabled={countdown > 0 || busy} onClick={resend} className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-input bg-background text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:text-muted-foreground"><RotateCw className="h-4 w-4" />{busy ? "Please wait…" : countdown > 0 ? "Resend email in 0:" + String(countdown).padStart(2, "0") : "Resend email"}</button></div><p className="mt-6 text-center text-sm text-muted-foreground">Wrong address? <TextLink onClick={() => onScreen("signup")}>Change email</TextLink></p><p className="mt-2 text-center text-xs text-muted-foreground">Didn't get it? Check spam or promotions folders.</p></div>;
}

function SignIn({ onScreen, onGoogle }: { onScreen: (screen: Screen) => void; onGoogle: () => Promise<void> }) {
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(old => ({ ...old, [key]: event.target.value }));
  const errors = { email: emailOk(form.email.trim()) ? "" : "Enter a valid email address", username: /^[a-z0-9_]{3,24}$/i.test(form.username.trim()) ? "" : "Enter your XoraTV username", password: form.password ? "" : "Enter your password" };
  const error = (key: keyof typeof errors) => submitted ? errors[key] : "";
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitted(true); if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try { await confirmVerifiedEmailAndSignIn(form.email, form.username, form.password); toast.success("Welcome back to XoraTV!"); window.location.assign("/"); }
    catch (err) { toast.error(mapAuthError(err)); }
    finally { setBusy(false); }
  };
  return <div><ScreenHeader title="Welcome back" subtitle={<>New to XoraTV? <TextLink onClick={() => onScreen("signup")}>Create an account</TextLink></>} /><form onSubmit={submit} noValidate className="space-y-4">
    <Field label="Email" type="email" icon={<Mail className="h-4 w-4" />} placeholder="you@example.com" value={form.email} onChange={update("email")} error={error("email")} autoComplete="email" />
    <div className="rounded-2xl border border-clay/50 bg-accent/50 p-3"><Field label="XoraTV username" icon={<UserRound className="h-4 w-4" />} placeholder="amara_creates" value={form.username} onChange={update("username")} error={error("username")} hint="Your profile handle — separate from your password." autoComplete="username" /></div>
    <div><div className="mb-1.5 flex items-center justify-between"><span className="text-[13px] font-semibold">Password</span><button type="button" onClick={() => onScreen("forgot")} className="text-xs font-semibold text-primary hover:underline">Forgot password?</button></div><Field label="" aria-label="Password" type={showPassword ? "text" : "password"} icon={<Lock className="h-4 w-4" />} placeholder="Your password" value={form.password} onChange={update("password")} error={error("password")} right={<PasswordToggle show={showPassword} onToggle={() => setShowPassword(!showPassword)} />} autoComplete="current-password" /></div>
    <PrimaryButton type="submit" busy={busy}>Sign in</PrimaryButton>
  </form><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div><button type="button" onClick={() => void onGoogle()} className="press flex h-11 w-full items-center justify-center rounded-xl border border-border bg-background text-sm font-semibold hover:bg-secondary">Continue with Google</button><SecurityNote /></div>;
}

function ForgotPassword({ onScreen, setPendingEmail }: { onScreen: (screen: Screen) => void; setPendingEmail: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const error = submitted && !emailOk(email.trim()) ? "Enter a valid email address" : "";
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSubmitted(true); if (!emailOk(email.trim())) return; setBusy(true); try { await sendPasswordReset(email.trim()); setPendingEmail(email.trim()); onScreen("forgot-sent"); } catch (err) { toast.error(mapAuthError(err)); } finally { setBusy(false); } };
  return <form onSubmit={submit} noValidate><ScreenHeader back={() => onScreen("signin")} title="Reset your password" subtitle="Enter the email on your account and we'll send a secure reset link." /><div className="space-y-4"><Field label="Email" type="email" icon={<Mail className="h-4 w-4" />} placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} error={error} autoComplete="email" /><PrimaryButton type="submit" busy={busy}>Send reset link</PrimaryButton></div></form>;
}
function ForgotSent({ email, onScreen }: { email: string; onScreen: (screen: Screen) => void }) {
  return <div><div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-success/10"><ShieldCheck className="h-6 w-6 text-success" /></div><ScreenHeader title="Check your inbox" subtitle={<>If an account exists for <b className="text-foreground">{maskEmail(email)}</b>, a secure reset link should arrive shortly.</>} /><Notice>Check your inbox and spam folder for the password-reset email.</Notice><div className="mt-6"><PrimaryButton type="button" onClick={() => onScreen("signin")}>Back to sign in</PrimaryButton></div></div>;
}

function AuthPage() {
  const [screen, setScreen] = useState<Screen>("signin");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const [pendingUsername, setPendingUsername] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && user) void navigate({ to: "/" }); }, [user, loading, navigate]);
  useEffect(() => {
    let mounted = true;
    checkRedirectAuthResult().then(profile => { if (mounted && profile) void navigate({ to: "/" }); }).catch(error => { if (mounted) toast.error(mapAuthError(error)); });
    return () => { mounted = false; };
  }, [navigate]);
  const google = async () => {
    try {
      if (!isFirebaseConfigured()) throw new Error("Google sign-in is temporarily unavailable.");
      const result = await signInWithGoogle();
      if (result.redirected) return;
      if (result.credential?.user && !result.credential.user.emailVerified) { await signOutCurrentUser(); throw new Error("Please verify your email before entering XoraTV."); }
      toast.success("Signed in — welcome to XoraTV!"); void navigate({ to: "/" });
    } catch (error) { toast.error(mapAuthError(error)); }
  };
  return <div className="xora-auth-page min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
    <aside className="xora-auth-brand relative hidden overflow-hidden lg:block"><div className="xora-auth-glow xora-auth-glow-one" /><div className="xora-auth-glow xora-auth-glow-two" /><div className="relative flex h-full flex-col justify-between p-12 xl:p-16"><Brand light /><div className="max-w-md"><p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Stories from everywhere</p><h2 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">Watch, share and create the culture you love.</h2><p className="mt-5 text-base leading-relaxed text-white/70">Join a community of creators and viewers bringing stories, music and entertainment to the world.</p><div className="mt-8 flex items-center gap-3"><div className="flex -space-x-2">{["X","C","T","V"].map((letter,index)=><span key={letter} className="xora-auth-avatar grid h-8 w-8 place-items-center rounded-full border-2 border-ink text-xs font-semibold" style={{ opacity: 1 - index * .12 }}>{letter}</span>)}</div><span className="text-sm text-white/70">Your next favourite story starts here</span></div></div><p className="text-xs text-white/45">A little closer, every day.</p></div></aside>
    <main className="flex min-h-screen flex-col px-4 py-6 sm:px-8 lg:py-10"><div className="mx-auto flex w-full max-w-[440px] items-center justify-between lg:justify-end"><div className="lg:hidden"><Brand /></div><span className="xora-auth-pill rounded-full border border-border bg-surface/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your XoraTV account</span></div>
      <div className="flex flex-1 items-center justify-center py-8"><div key={screen} className="xora-auth-card rise w-full max-w-[440px] rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
        {screen === "signup" && <SignUp onScreen={setScreen} setPending={(email,password,username)=>{setPendingEmail(email);setPendingPassword(password);setPendingUsername(username);}} />}
        {screen === "verify" && <VerifyEmail email={pendingEmail} username={pendingUsername} password={pendingPassword} onScreen={setScreen} />}
        {screen === "signin" && <SignIn onScreen={setScreen} onGoogle={google} />}
        {screen === "forgot" && <ForgotPassword onScreen={setScreen} setPendingEmail={setResetEmail} />}
        {screen === "forgot-sent" && <ForgotSent email={resetEmail} onScreen={setScreen} />}
      </div></div>

    </main>
  </div>;
}
