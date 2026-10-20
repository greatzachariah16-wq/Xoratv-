import { useEffect, useState, type ReactNode, type InputHTMLAttributes } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, AtSign, Check, Eye, EyeOff, Info, Loader2, Lock, Mail, Play, ShieldCheck, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { customSignUp, customSignIn, customRecoverWithCode } from "@/integrations/custom-auth";
function mapAuthError(error: unknown): string { return error instanceof Error ? error.message : "Authentication failed. Please try again."; }
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Join XoraTV — Sign in or create an account" },
    { name: "description", content: "Create your XoraTV account, join the community." },
    { property: "og:title", content: "Join XoraTV" },
    { property: "og:description", content: "Watch, share and create on XoraTV." },
    { name: "robots", content: "noindex" },
  ] }),
  component: AuthPage,
});

type Screen = "signup" | "signin" | "forgot" | "recovery-code";
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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
  return <div className="mt-6 flex gap-2.5 rounded-xl border border-border bg-secondary/60 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>Your password is securely hashed by XoraTV. Your profile is stored separately from your sign-in credentials.</p></div>;
}
function ScreenHeader({ title, subtitle, back }: { title: string; subtitle: ReactNode; back?: () => void }) {
  return <div className="mb-6">{back && <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back</button>}<h1 className="text-2xl font-semibold text-foreground sm:text-[28px]">{title}</h1><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p></div>;
}

function SignUp({ onScreen, onRecovery }: { onScreen: (screen: Screen) => void; onRecovery: (code: string) => void }) {
  const [form,setForm]=useState({first:"",last:"",username:"",email:"",password:"",confirm:""});
  const [showPassword,setShowPassword]=useState(false); const [showConfirm,setShowConfirm]=useState(false);
  const [terms,setTerms]=useState(false); const [submitted,setSubmitted]=useState(false); const [busy,setBusy]=useState(false);
  const update=(key:keyof typeof form)=>(event:React.ChangeEvent<HTMLInputElement>)=>setForm(old=>({...old,[key]:event.target.value}));
  const errors={first:form.first.trim()?"":"Enter your first name",last:form.last.trim()?"":"Enter your last name",username:/^[a-z0-9_]{3,24}$/i.test(form.username.trim())?"":"Use 3–24 letters, numbers or underscores",email:emailOk(form.email.trim())?"":"Enter a valid email address",password:form.password.length>=10?"":"Use at least 10 characters",confirm:form.confirm&&form.confirm===form.password?"":"Passwords don't match",terms:terms?"":"Please accept the terms to continue"};
  const error=(key:keyof typeof errors)=>submitted?errors[key]:"";
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setSubmitted(true);if(Object.values(errors).some(Boolean))return;setBusy(true);try{const result=await customSignUp(form.email,form.password,form.username,form.first,form.last);onRecovery(result.recoveryCode);onScreen("recovery-code");toast.success("Your XoraTV account is ready.");}catch(err){toast.error(mapAuthError(err));}finally{setBusy(false);}};
  return <form onSubmit={submit} noValidate><ScreenHeader title="Create your account" subtitle={<>Already on XoraTV? <TextLink onClick={()=>onScreen("signin")}>Sign in</TextLink></>}/><div className="space-y-4">
    <div className="grid grid-cols-2 gap-3"><Field label="First name" placeholder="Amara" value={form.first} onChange={update("first")} error={error("first")} autoComplete="given-name"/><Field label="Last name" placeholder="Okafor" value={form.last} onChange={update("last")} error={error("last")} autoComplete="family-name"/></div>
    <Field label="Username" icon={<AtSign className="h-4 w-4"/>} placeholder="amara_creates" value={form.username} onChange={update("username")} error={error("username")} autoComplete="username"/>
    <Field label="Email (for account identification)" type="email" icon={<Mail className="h-4 w-4"/>} placeholder="you@example.com" value={form.email} onChange={update("email")} error={error("email")} autoComplete="email"/>
    <Field label="Password" type={showPassword?"text":"password"} icon={<Lock className="h-4 w-4"/>} placeholder="At least 10 characters" value={form.password} onChange={update("password")} error={error("password")} right={<PasswordToggle show={showPassword} onToggle={()=>setShowPassword(!showPassword)}/>} autoComplete="new-password"/>
    <Field label="Confirm password" type={showConfirm?"text":"password"} icon={<Lock className="h-4 w-4"/>} placeholder="Re-enter password" value={form.confirm} onChange={update("confirm")} error={error("confirm")} right={<PasswordToggle show={showConfirm} onToggle={()=>setShowConfirm(!showConfirm)}/>} autoComplete="new-password"/>
    <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-muted-foreground"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0"/><span>I agree to XoraTV's <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">Terms</Link> and <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">Privacy Policy</Link>.</span></label>
    {error("terms")&&<p className="text-xs text-destructive">{error("terms")}</p>}<PrimaryButton type="submit" busy={busy}>Create account</PrimaryButton></div><SecurityNote/></form>;
}function SignIn({ onScreen }: { onScreen: (screen: Screen) => void }) {
  const [identifier,setIdentifier]=useState("");const [password,setPassword]=useState("");const [show,setShow]=useState(false);const [busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();if(!identifier.trim()||!password){toast.error("Enter your username or email and password.");return;}setBusy(true);try{await customSignIn(identifier,password);toast.success("Welcome back to XoraTV!");window.location.assign("/");}catch(err){toast.error(mapAuthError(err));}finally{setBusy(false);}};
  return <div><ScreenHeader title="Welcome back" subtitle={<>New to XoraTV? <TextLink onClick={()=>onScreen("signup")}>Create an account</TextLink></>}/><form onSubmit={submit} className="space-y-4"><Field label="Username or email" icon={<UserRound className="h-4 w-4"/>} placeholder="Your username or email" value={identifier} onChange={e=>setIdentifier(e.target.value)} autoComplete="username"/><Field label="Password" type={show?"text":"password"} icon={<Lock className="h-4 w-4"/>} placeholder="Your password" value={password} onChange={e=>setPassword(e.target.value)} right={<PasswordToggle show={show} onToggle={()=>setShow(!show)}/>} autoComplete="current-password"/><button type="button" onClick={()=>onScreen("forgot")} className="text-xs font-semibold text-primary hover:underline">Forgot password? Use your recovery code</button><PrimaryButton type="submit" busy={busy}>Sign in</PrimaryButton></form><SecurityNote/></div>;
}function ForgotPassword({ onScreen, onRecovery }: { onScreen: (screen: Screen) => void; onRecovery: (code: string) => void }) {
  const [identifier,setIdentifier]=useState("");const [code,setCode]=useState("");const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{event.preventDefault();if(!identifier.trim()||!code.trim()){toast.error("Enter your username/email and recovery code.");return;}if(password.length<10||password!==confirm){toast.error("Enter matching passwords with at least 10 characters.");return;}setBusy(true);try{const result=await customRecoverWithCode(identifier,code,password);onRecovery(result.recoveryCode);onScreen("recovery-code");toast.success("Password reset successfully.");}catch(err){toast.error(mapAuthError(err));}finally{setBusy(false);}};
  return <form onSubmit={submit} noValidate><ScreenHeader back={()=>onScreen("signin")} title="Recover your account" subtitle="Use the recovery code you saved when you created your XoraTV account. The code will be replaced after recovery."/><div className="space-y-4"><Field label="Username or email" value={identifier} onChange={e=>setIdentifier(e.target.value)} autoComplete="username" placeholder="Your username or email"/><Field label="Recovery code" value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" placeholder="XORA-XXXXXX-XXXXXX-XXXXXX"/><Field label="New password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 10 characters"/><Field label="Confirm new password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" placeholder="Repeat new password"/><PrimaryButton type="submit" busy={busy}>Recover account</PrimaryButton></div></form>;
}
function RecoveryCode({ code, onContinue }: { code: string; onContinue: () => void }) {
  const [copied,setCopied]=useState(false);
  return <div><div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-accent"><ShieldCheck className="h-6 w-6 text-primary"/></div><ScreenHeader title="Save your recovery code" subtitle="This code is shown only once. If you lose it and are logged out, XoraTV cannot recover the account for you."/><Notice tone="error">Keep this code private. Anyone with it and your username/email could reset your password.</Notice><div className="my-5 rounded-xl border border-border bg-background p-4 text-center font-mono text-base font-bold tracking-wider">{code}</div><div className="space-y-3"><PrimaryButton type="button" onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);toast.success("Recovery code copied.");}catch{toast.error("Copy failed. Please select and copy the code manually.");}}}>{copied?"Copied":"Copy recovery code"}</PrimaryButton><PrimaryButton type="button" onClick={onContinue}>I've saved my code — continue</PrimaryButton></div></div>;
}function AuthPage() {
  const [screen,setScreen]=useState<Screen>("signin");
  const [recoveryCode,setRecoveryCode]=useState("");
  const {user,loading}=useAuth();const navigate=useNavigate();
  useEffect(()=>{if(!loading&&user&&screen!=="recovery-code")void navigate({to:"/"});},[user,loading,navigate,screen]);
  return <div className="xora-auth-page min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
    <aside className="xora-auth-brand relative hidden overflow-hidden lg:block"><div className="xora-auth-glow xora-auth-glow-one"/><div className="xora-auth-glow xora-auth-glow-two"/><div className="relative flex h-full flex-col justify-between p-12 xl:p-16"><Brand light/><div className="max-w-md"><p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Stories from everywhere</p><h2 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">Watch, share and create the culture you love.</h2><p className="mt-5 text-base leading-relaxed text-white/70">Join a community of creators and viewers bringing stories, music and entertainment to the world.</p></div><p className="text-xs text-white/45">A little closer, every day.</p></div></aside>
    <main className="flex min-h-screen flex-col px-4 py-6 sm:px-8 lg:py-10"><div className="mx-auto flex w-full max-w-[440px] items-center justify-between lg:justify-end"><div className="lg:hidden"><Brand/></div><span className="xora-auth-pill rounded-full border border-border bg-surface/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your XoraTV account</span></div>
      <div className="flex flex-1 items-center justify-center py-8"><div key={screen} className="xora-auth-card rise w-full max-w-[440px] rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
        {screen==="signup"&&<SignUp onScreen={setScreen} onRecovery={setRecoveryCode}/>}
        {screen==="signin"&&<SignIn onScreen={setScreen}/>}
        {screen==="forgot"&&<ForgotPassword onScreen={setScreen} onRecovery={setRecoveryCode}/>}
        {screen==="recovery-code"&&<RecoveryCode code={recoveryCode} onContinue={()=>window.location.assign("/")}/>}
      </div></div></main></div>;
}
