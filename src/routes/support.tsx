import { FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, CircleHelp, Clock3, Gift, LockKeyhole, Mail, MessageCircle, MessageSquare, MessageSquareText, PlayCircle, Search, Send, ShieldCheck, Sparkles, UserRound, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/xora/AppShell";
import { Logo } from "@/components/xora/Logo";
import { useAuth } from "@/hooks/useAuth";
import { createSupportTicket, subscribeToUserSupportTickets, type SupportCategory, type SupportTicket } from "@/integrations/firebase/support";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [
    { title: "Xora Care — Support" },
    { name: "description", content: "Find answers and get thoughtful help from the XoraTV support team." },
    { property: "og:title", content: "Xora Care — Support" },
    { property: "og:description", content: "A better way to get help with XoraTV." },
  ] }),
  component: SupportPage,
});

type CategoryOption = { value: SupportCategory; label: string; description: string; icon: typeof UserRound };
const categories: CategoryOption[] = [
  { value: "technical", label: "Playback & app", description: "Videos, buffering and app issues", icon: PlayCircle },
  { value: "account", label: "Account access", description: "Sign-in, profile and account help", icon: UserRound },
  { value: "billing", label: "Data & rewards", description: "Rewards, claims and billing", icon: Gift },
  { value: "report", label: "Safety & reports", description: "Report content or a concern", icon: ShieldCheck },
  { value: "privacy", label: "Privacy", description: "Your data and account privacy", icon: LockKeyhole },
  { value: "feedback", label: "Ideas & feedback", description: "Help us make Xora better", icon: MessageCircle },
  { value: "other", label: "Something else", description: "A question that doesn't fit above", icon: CircleHelp },
];
const faqs = [
  ["A video will not play", "Refresh the page and check your connection. If it continues, tell us the video title, your device and what happens when you press play."],
  ["I cannot sign in", "Check that you are using the same account details you registered with. If you are still locked out, submit a request with the account email and a short description."],
  ["My data reward has not arrived", "Check the claim status in Data Rewards first. If it remains pending, include the bundle, points deducted and the approximate time of your claim."],
  ["How do I report a video or user?", "Choose Safety & reports and include the video or profile link, what concerned you and any details that will help our team review it."],
  ["Where can I see my support replies?", "Once signed in, your support requests and team replies appear in My support requests on this page."],
  ["Can I update a request after sending it?", "Refer to your ticket ID when contacting the team again so they can find the right request."],
  ["How do I protect my account?", "Never share your password or recovery details. Xora support will not ask you to send a password or one-time sign-in code."],
  ["How do I suggest a feature?", "Choose Ideas & feedback and describe what you would like to see, who it would help and how you imagine it working."],
] as const;

function SupportPage() {
  return <AppShell wide><main className="mx-auto max-w-5xl pb-12 text-[#3d3029]">
    <header className="mb-5 flex items-center justify-between gap-3 px-1">
      <Link to="/" className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-xs font-medium text-[#806e62] transition hover:bg-[#f4ebe3] hover:text-[#49372d]"><ArrowLeft className="size-4"/>Back to Xora</Link>
      <Logo/>
    </header>
    <SupportHero/>
    <UserTicketsList/>
    <div className="mt-7 grid items-start gap-6 lg:grid-cols-[1.04fr_.96fr] lg:gap-7"><SupportForm/><FaqPanel/></div>
    <footer className="mt-8 flex flex-col gap-3 border-t border-[#e8dcd2] px-1 py-6 text-[10px] text-[#9a887c] sm:flex-row sm:items-center sm:justify-between">
      <span>© XoraTV · Here when you need us.</span>
      <div className="flex gap-4"><Link to="/privacy" className="transition hover:text-[#a65337]">Privacy & Terms</Link><Link to="/" className="transition hover:text-[#a65337]">Xora home</Link></div>
    </footer>
  </main></AppShell>;
}

function SupportHero() {
  return <section className="relative isolate overflow-hidden rounded-[30px] border border-[#e4d3c5] bg-[#f2e7dc] px-5 py-8 shadow-[0_22px_55px_-42px_rgba(63,42,29,.45)] sm:px-9 sm:py-10 lg:px-12">
    <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 size-[330px] rounded-full border border-[#b87556]/20"/>
    <div aria-hidden="true" className="pointer-events-none absolute -right-5 -top-14 size-[225px] rounded-full border border-[#b87556]/20"/>
    <div className="relative max-w-2xl">
      <span className="inline-flex items-center gap-2 rounded-full border border-[#b9795b]/25 bg-white/55 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.22em] text-[#98543b]"><Sparkles className="size-3.5"/>Xora Care</span>
      <h1 className="mt-5 max-w-xl font-editorial text-[2.65rem] leading-[.98] tracking-[-.045em] text-[#3d2d25] sm:text-5xl lg:text-[3.6rem]">We're here to <em className="font-normal text-[#a65337]">help.</em></h1>
      <p className="mt-4 max-w-lg text-[13px] leading-6 text-[#78665a] sm:text-[15px] sm:leading-7">A better experience starts with being heard. Find a quick answer or tell our team what you need.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ddc9b9] bg-[#fffaf5]/70 px-3 py-2 text-[10px] font-medium text-[#806d60]"><MessageSquare className="size-3.5 text-[#a65337]"/>Personal ticket tracking</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ddc9b9] bg-[#fffaf5]/70 px-3 py-2 text-[10px] font-medium text-[#806d60]"><ShieldCheck className="size-3.5 text-[#a65337]"/>Your account stays protected</span>
      </div>
    </div>
  </section>;
}

function UserTicketsList() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  useEffect(() => { if (!user) { setTickets([]); return; } return subscribeToUserSupportTickets(user.id, setTickets); }, [user?.id]);
  if (!user || tickets.length === 0) return null;
  return <section className="mt-7 rounded-[26px] border border-[#e8d9cd] bg-[#fffdf9] p-5 shadow-[0_15px_40px_-35px_rgba(55,37,27,.35)] sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.2em] text-[#a65337]"><MessageSquare className="size-3.5"/>Your support inbox</p><h2 className="mt-2 font-editorial text-2xl text-[#3d3029]">My support requests</h2><p className="mt-1 text-xs text-[#8a786c]">Your ticket history and replies from the Xora team.</p></div><span className="rounded-full border border-[#eadbd0] bg-[#f8f0e9] px-3 py-1.5 text-[10px] font-semibold text-[#956047]">{tickets.length} {tickets.length === 1 ? "request" : "requests"}</span></div>
    <div className="mt-5 space-y-3">{tickets.map(t => <article key={t.id} className="rounded-2xl border border-[#eee2d8] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#f0e7df] pb-3"><div className="min-w-0"><p className="font-mono text-[9px] font-semibold tracking-wide text-[#a65337]">{t.id}</p><h3 className="mt-1 break-words text-sm font-semibold text-[#44352d]">{t.subject}</h3><p className="mt-1 text-[10px] text-[#9b887c]">{timeAgo(t.created_at)}</p></div><TicketStatus status={t.status}/></div>
      <p className="whitespace-pre-wrap py-3 text-xs leading-6 text-[#77675c]">{t.message}</p>
      {t.replies?.length ? <div className="space-y-2 border-t border-[#f0e7df] pt-3">{t.replies.map(reply => <div key={reply.id} className="rounded-xl bg-[#f8f0e9] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#96523a]"><ShieldCheck className="size-3.5"/>{reply.sender_name}</span><span className="text-[9px] text-[#9b887c]">{timeAgo(reply.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[#59483e]">{reply.message}</p></div>)}</div> : <p className="inline-flex items-center gap-2 border-t border-[#f0e7df] pt-3 text-[10px] text-[#988579]"><Clock3 className="size-3.5"/>Your request is with the support team.</p>}
    </article>)}</div>
  </section>;
}

function TicketStatus({status}: {status: SupportTicket["status"]}) {
  const style = status === "resolved" || status === "closed" ? "border-[#cfe0d1] bg-[#eff6ef] text-[#4e7755]" : status === "pending" ? "border-[#e8d5b2] bg-[#fbf4e7] text-[#946c30]" : "border-[#e7d6c9] bg-[#f8eee7] text-[#98563c]";
  return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] ${style}`}>{status === "pending" ? "Reply received" : status}</span>;
}

function SupportForm() {
  const { user, profile } = useAuth();
  const [category, setCategory] = useState<SupportCategory>("other");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  useEffect(() => { if (user?.email) setEmail(user.email); }, [user?.email]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) { toast.error("Please sign in before sending a support request."); return; }
    if (subject.trim().length < 3) { toast.error("Please add a short subject."); return; }
    if (message.trim().length < 15) { toast.error("Please give us a little more detail so we can investigate."); return; }
    setBusy(true);
    try {
      const ticket = await createSupportTicket({ user_id: user.id, email: email.trim() || user.email, display_name: profile?.display_name || user.displayName, username: profile?.username || null, category, subject: subject.trim(), message: message.trim() });
      setTicketId(ticket.id); setSubject(""); setMessage(""); toast.success("Your support request has been sent.");
    } catch (error) { console.error("Support request failed:", error); toast.error("We could not send your request. Please try again."); }
    finally { setBusy(false); }
  };

  const panel = "rounded-[26px] border border-[#e8d9cd] bg-[#fffdf9] p-5 shadow-[0_15px_40px_-35px_rgba(55,37,27,.35)] sm:p-7";
  if (ticketId) return <section className={panel}>
    <div className="grid size-12 place-items-center rounded-full border border-[#d7c2b3] bg-[#f8eee6] text-[#a65337]"><CheckCircle2 className="size-6"/></div>
    <p className="mt-5 text-[9px] font-bold uppercase tracking-[.2em] text-[#a65337]">Safely received</p><h2 className="mt-2 font-editorial text-3xl text-[#3d3029]">Thank you for reaching out.</h2>
    <p className="mt-2 text-xs leading-6 text-[#847267]">Your request is now recorded. Keep this reference handy if you need to follow up.</p>
    <div className="mt-5 rounded-2xl border border-[#eadbd0] bg-[#f8f0e9] p-4"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#9a7966]">Your ticket reference</p><p className="mt-1 font-mono text-sm font-semibold tracking-wide text-[#543d31]">{ticketId}</p></div>
    <button type="button" onClick={() => setTicketId(null)} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#a65337] px-5 py-3 text-xs font-semibold text-white transition hover:bg-[#8f472f]">Send another request <ArrowRight className="size-3.5"/></button>
  </section>;

  return <section id="contact-support" className={`${panel} scroll-mt-20`}>
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[#ead7ca] bg-[#f8eee6] text-[#a65337]"><MessageSquareText className="size-5"/></span><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a65337]">Talk to our team</p><h2 className="mt-1 font-editorial text-2xl text-[#3d3029]">How can we support you?</h2><p className="mt-1 text-xs leading-5 text-[#8b786c]">Share a little detail and we'll take it from here.</p></div></div>
    {!user ? <div className="mt-5 rounded-2xl border border-[#ead7ca] bg-[#f8f0e9] p-4"><p className="text-sm font-semibold text-[#49372d]">Sign in to contact support</p><p className="mt-1 text-xs leading-5 text-[#877366]">Signing in lets us attach your request to the right Xora account and show replies here.</p><Link to="/auth" className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#a65337] px-4 py-2.5 text-xs font-semibold text-white">Sign in <ArrowRight className="size-3.5"/></Link></div> :
    <form onSubmit={submit} className="mt-6 space-y-5">
      <fieldset><legend className="text-xs font-semibold text-[#57453a]">Choose a topic</legend><div className="mt-3 grid grid-cols-2 gap-2">
        {categories.map(item => { const Icon=item.icon; const selected=category===item.value; return <button key={item.value} type="button" onClick={()=>setCategory(item.value)} aria-pressed={selected} className={`group flex min-h-[76px] items-start gap-2.5 rounded-2xl border p-3 text-left transition ${selected ? "border-[#c58a6c] bg-[#f8eee6] shadow-[0_6px_18px_-14px_rgba(120,61,39,.5)]" : "border-[#eee2d8] bg-white hover:border-[#ddc4b4] hover:bg-[#fdf9f5]"}`}><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#a65337] text-white" : "bg-[#f6eee8] text-[#a65337]"}`}><Icon className="size-4"/></span><span className="min-w-0"><span className="block text-[11px] font-semibold leading-4 text-[#4c3a30]">{item.label}</span><span className="mt-1 block text-[9px] leading-4 text-[#988579]">{item.description}</span></span></button>; })}
      </div></fieldset>
      <div><label htmlFor="support-subject" className="text-xs font-semibold text-[#57453a]">Subject</label><input id="support-subject" required minLength={3} maxLength={120} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="A short summary of the issue" className="mt-2 h-11 w-full rounded-xl border border-[#e8dcd2] bg-white px-3.5 text-sm text-[#49372d] outline-none transition placeholder:text-[#b2a399] focus:border-[#bd8061] focus:ring-2 focus:ring-[#bd8061]/15"/></div>
      <div><label htmlFor="support-email" className="text-xs font-semibold text-[#57453a]">Reply email</label><input id="support-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="mt-2 h-11 w-full rounded-xl border border-[#e8dcd2] bg-white px-3.5 text-sm text-[#49372d] outline-none transition placeholder:text-[#b2a399] focus:border-[#bd8061] focus:ring-2 focus:ring-[#bd8061]/15"/><p className="mt-1.5 text-[10px] text-[#9a887c]">Only used for replies about this request.</p></div>
      <div><div className="flex items-center justify-between gap-2"><label htmlFor="support-message" className="text-xs font-semibold text-[#57453a]">Tell us what happened</label><span className="text-[9px] tabular-nums text-[#a18e81]">{message.length}/4000</span></div><textarea id="support-message" required minLength={15} maxLength={4000} rows={6} value={message} onChange={e=>setMessage(e.target.value)} placeholder="What were you trying to do, and what happened instead?" className="mt-2 min-h-36 w-full resize-y rounded-xl border border-[#e8dcd2] bg-white px-3.5 py-3 text-sm leading-6 text-[#49372d] outline-none transition placeholder:text-[#b2a399] focus:border-[#bd8061] focus:ring-2 focus:ring-[#bd8061]/15"/></div>
      <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#a65337] px-4 py-3 text-xs font-semibold text-white shadow-[0_10px_22px_-14px_rgba(120,61,39,.65)] transition hover:bg-[#8f472f] disabled:cursor-wait disabled:opacity-60">{busy ? "Sending your request…" : "Send to Xora Care"} {!busy ? <Send className="size-3.5"/> : null}</button>
      <p className="text-center text-[9px] leading-4 text-[#a18e81]">Please don't include passwords or one-time sign-in codes.</p>
    </form>}
  </section>;
}

function FaqPanel() {
  const [open,setOpen]=useState<number|null>(0); const [search,setSearch]=useState("");
  const filtered=useMemo(()=>{const term=search.trim().toLowerCase();return term?faqs.filter(([q,a])=>q.toLowerCase().includes(term)||a.toLowerCase().includes(term)):faqs;},[search]);
  return <section className="rounded-[26px] border border-[#e8d9cd] bg-[#fffdf9] p-5 shadow-[0_15px_40px_-35px_rgba(55,37,27,.35)] sm:p-7">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[#ead7ca] bg-[#f8eee6] text-[#a65337]"><BookOpen className="size-5"/></span><div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#a65337]">The help library</p><h2 className="mt-1 font-editorial text-2xl text-[#3d3029]">A few quick answers.</h2><p className="mt-1 text-xs leading-5 text-[#8b786c]">You might find what you need right here.</p></div></div>
    <label className="mt-5 flex h-11 items-center gap-2.5 rounded-xl border border-[#e8dcd2] bg-white px-3.5 focus-within:border-[#bd8061] focus-within:ring-2 focus-within:ring-[#bd8061]/15"><Search className="size-4 shrink-0 text-[#a65337]"/><input aria-label="Search help answers" value={search} onChange={e=>{setSearch(e.target.value);setOpen(0);}} placeholder="Search help topics…" className="min-w-0 flex-1 bg-transparent text-xs text-[#49372d] outline-none placeholder:text-[#b2a399]"/>{search ? <button type="button" onClick={()=>setSearch("")} aria-label="Clear search"><X className="size-3.5 text-[#9a887c]"/></button> : null}</label>
    <div className="mt-4 divide-y divide-[#eee5dd] border-y border-[#eee5dd]">{filtered.map(([q,a],i)=>{const expanded=open===i;return <div key={q}><button type="button" onClick={()=>setOpen(expanded?null:i)} aria-expanded={expanded} className="flex min-h-12 w-full items-center justify-between gap-3 py-3.5 text-left text-xs font-semibold text-[#514036]">{q}<ChevronDown className={`size-4 shrink-0 text-[#a65337] transition-transform ${expanded?"rotate-180":""}`}/></button>{expanded?<p className="max-w-prose pb-4 pr-4 text-xs leading-6 text-[#827064]">{a}</p>:null}</div>;})}{filtered.length===0?<p className="py-7 text-center text-xs text-[#978579]">No matching answer yet. Send our team a message and we'll help.</p>:null}</div>
    <a href="#contact-support" className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[#eadbd0] bg-[#f8f0e9] p-4 transition hover:border-[#d8b9a7]"><span className="flex items-start gap-2.5"><Mail className="mt-0.5 size-4 text-[#a65337]"/><span><span className="block text-xs font-semibold text-[#503c31]">Still need a hand?</span><span className="mt-1 block text-[10px] leading-4 text-[#8d796c]">Our support form is just below.</span></span></span><ArrowRight className="size-4 shrink-0 text-[#a65337]"/></a>
  </section>;
}
