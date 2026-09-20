import { FormEvent, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileQuestion,
  LifeBuoy,
  Mail,
  MessageSquare,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/xora/AppShell";
import { Logo } from "@/components/xora/Logo";
import { useAuth } from "@/hooks/useAuth";
import {
  createSupportTicket,
  subscribeToUserSupportTickets,
  type SupportCategory,
  type SupportTicket,
} from "@/integrations/firebase/support";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & Support — Xora" },
      {
        name: "description",
        content:
          "Get help with your Xora account, videos, playback, reports and other support questions.",
      },
      { property: "og:title", content: "Help & Support — Xora" },
      {
        property: "og:description",
        content: "Find answers or contact the Xora support team.",
      },
    ],
  }),
  component: SupportPage,
});

type CategoryOption = {
  value: SupportCategory;
  label: string;
  description: string;
  icon: typeof UserRound;
};

const categories: CategoryOption[] = [
  {
    value: "technical",
    label: "Technical problem",
    description: "Playback, loading, buffering, or app bugs",
    icon: Wrench,
  },
  {
    value: "account",
    label: "Account & sign in",
    description: "Login, profile, or account access",
    icon: UserRound,
  },
  {
    value: "billing",
    label: "Billing & rewards",
    description: "Reward eligibility, mobile data, or billing questions",
    icon: FileQuestion,
  },
  {
    value: "report",
    label: "Report something",
    description: "Safety, abuse, copyright, or policy concern",
    icon: AlertCircle,
  },
  {
    value: "privacy",
    label: "Privacy & data",
    description: "Privacy or personal-data inquiry",
    icon: ShieldCheck,
  },
  {
    value: "feedback",
    label: "Feedback & ideas",
    description: "Feature suggestions and product improvements",
    icon: Sparkles,
  },
  {
    value: "other",
    label: "Something else",
    description: "Anything that does not fit above",
    icon: CircleHelp,
  },
];

const faqs = [
  [
    "A video will not play",
    "Try refreshing the page and checking your connection. If the issue continues, tell us the title of the video and what happens when you press play.",
  ],
  [
    "I cannot sign in",
    "Make sure you are using the same email address you used when creating your Xora account. If you still cannot access it, send us the account email and a short description of the problem.",
  ],
  [
    "I want to report content",
    "Choose “Report something” and include the post or creator name, what you are reporting, and enough detail for the support team to investigate.",
  ],
  [
    "How do I contact support?",
    "Use the support form below. Your message receives a ticket ID so you can keep a record of the request.",
  ],
];

function SupportPage() {
  return (
    <AppShell wide>
      <div className="rise mx-auto max-w-4xl">
        <SupportHeader />
        <SupportHero />
        <UserTicketsList />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-start">
          <SupportForm />
          <FaqPanel />
        </div>
        <SupportFooter />
      </div>
    </AppShell>
  );
}

function UserTicketsList() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserSupportTickets(user.id, (data) => {
      setTickets(data);
    });
    return () => unsub();
  }, [user]);

  if (!user || tickets.length === 0) return null;

  return (
    <section className="mt-8 rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-card sm:p-7">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        <MessageSquare className="size-4" /> My Support Tickets & Admin Replies ({tickets.length})
      </div>
      <h2 className="mt-1 font-display text-xl font-semibold">Track Your Support Requests</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Replies from the Xora Support Team appear here in real-time.
      </p>

      <div className="mt-5 space-y-4">
        {tickets.map((t) => (
          <div
            key={t.id}
            className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
              <div>
                <span className="font-mono text-[10px] font-bold text-primary uppercase">
                  {t.id}
                </span>
                <h3 className="font-semibold text-sm text-foreground mt-0.5">{t.subject}</h3>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                  t.status === "open"
                    ? "bg-amber-500/15 text-amber-500"
                    : t.status === "resolved"
                      ? "bg-success/15 text-success"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {t.status === "pending" ? "Admin Replied" : t.status}
              </span>
            </div>

            <div className="text-xs text-muted-foreground bg-surface p-3 rounded-xl border border-border/60">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Your Request Message ({timeAgo(t.created_at)})
              </span>
              <p className="text-foreground/90 whitespace-pre-wrap">{t.message}</p>
            </div>

            {t.replies && t.replies.length > 0 ? (
              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> Support Team Replies ({t.replies.length})
                </h4>
                {t.replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="rounded-xl border border-primary/25 bg-primary/10 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-primary font-semibold text-[11px]">
                      <span>{reply.sender_name}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {timeAgo(reply.created_at)}
                      </span>
                    </div>
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {reply.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic flex items-center gap-1.5 pt-1">
                <Clock3 className="size-3" /> Waiting for support team response... You will be
                notified when an admin replies.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SupportHeader() {
  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      <Link
        to="/"
        className="press inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Xora
      </Link>
      <Logo />
    </header>
  );
}

function SupportHero() {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-surface px-6 py-8 shadow-card sm:px-10 sm:py-10">
      <div className="max-w-2xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
          <LifeBuoy className="size-3.5" />
          Xora Help Center
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          How can we help?
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          Find a quick answer below or send the support team a message. Give us enough detail to
          understand what happened and we will have a clearer starting point.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2">
            <Clock3 className="size-3.5" /> Support requests are tracked
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2">
            <ShieldCheck className="size-3.5" /> Your account details stay attached to your ticket
          </span>
        </div>
      </div>
    </section>
  );
}

function SupportForm() {
  const { user, profile } = useAuth();
  const [category, setCategory] = useState<SupportCategory>("other");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      toast.error("Please sign in before sending a support request.");
      return;
    }
    if (subject.trim().length < 3) {
      toast.error("Please add a short subject.");
      return;
    }
    if (message.trim().length < 15) {
      toast.error("Please give us a little more detail so we can investigate.");
      return;
    }

    setBusy(true);
    try {
      const ticket = await createSupportTicket({
        user_id: user.id,
        email: email.trim() || user.email,
        display_name: profile?.display_name || user.displayName,
        username: profile?.username || null,
        category,
        subject: subject.trim(),
        message: message.trim(),
      });
      setTicketId(ticket.id);
      setSubject("");
      setMessage("");
      toast.success("Your support request has been sent.");
    } catch (error) {
      console.error("Support request failed:", error);
      toast.error("We could not send your request. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (ticketId) {
    return (
      <section className="rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-7">
        <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
          <CheckCircle2 className="size-6" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-semibold">Request received</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your message has been recorded. Keep the ticket ID below if you need to refer to this
          request later.
        </p>
        <div className="mt-5 rounded-2xl border border-border bg-background p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Ticket ID
          </p>
          <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-foreground">
            {ticketId}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTicketId(null)}
          className="press mt-5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Send another request
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-7">
      <div>
        <h2 className="font-display text-xl font-semibold">Contact support</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tell us what went wrong.</p>
      </div>

      {!user ? (
        <div className="mt-5 rounded-2xl border border-primary/20 bg-accent/50 p-4">
          <p className="text-sm font-semibold">Sign in to submit a request</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            We attach your Xora account ID to the ticket so the support team can identify the
            affected account.
          </p>
          <Link
            to="/auth"
            className="press mt-3 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="support-category" className="text-sm font-medium">
            What do you need help with?
          </label>
          <div className="relative mt-2">
            <select
              id="support-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as SupportCategory)}
              className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {categories.find((item) => item.value === category)?.description}
          </p>
        </div>

        <div>
          <label htmlFor="support-subject" className="text-sm font-medium">
            Subject
          </label>
          <input
            id="support-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={120}
            placeholder="e.g. My video keeps buffering"
            className="mt-2 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="support-email" className="text-sm font-medium">
            Reply email
          </label>
          <input
            id="support-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="mt-2 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            We use this only as the contact address attached to the request.
          </p>
        </div>

        <div>
          <label htmlFor="support-message" className="text-sm font-medium">
            Tell us what happened
          </label>
          <textarea
            id="support-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={4000}
            rows={7}
            placeholder="Describe the problem, what you expected, and what happened instead…"
            className="mt-2 flex min-h-36 w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
          <div className="mt-1 flex justify-end text-[11px] text-muted-foreground">
            {message.length}/4000
          </div>
        </div>

        <button
          type="submit"
          disabled={busy || !user}
          className="press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-card disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send support request"}
          {!busy ? <MessageSquareText className="size-4" /> : null}
        </button>
      </form>
    </section>
  );
}

function FaqPanel() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <CircleHelp className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">Quick answers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A few common questions before you contact us.
          </p>
        </div>
      </div>
      <div className="mt-6 divide-y divide-border border-y border-border">
        {faqs.map(([question, answer], index) => {
          const isOpen = open === index;
          return (
            <div key={question}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : index)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-semibold"
              >
                {question}
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen ? (
                <p className="pb-4 pr-5 text-sm leading-6 text-muted-foreground">{answer}</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-6 rounded-2xl border border-border bg-background p-4">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 size-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">Need to explain more?</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Use the form and include the video title, creator name, device/browser, and any error
              message when relevant.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SupportFooter() {
  return (
    <footer className="mt-8 flex flex-col gap-3 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>© XoraTV · Help & Support</span>
      <div className="flex gap-4">
        <Link to="/privacy" className="hover:text-foreground hover:underline">
          Privacy & Terms
        </Link>
        <Link to="/" className="hover:text-foreground hover:underline">
          Xora home
        </Link>
      </div>
    </footer>
  );
}
