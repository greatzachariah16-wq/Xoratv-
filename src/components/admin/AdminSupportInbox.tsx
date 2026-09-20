import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquare,
  Send,
  User,
  ShieldCheck,
  CornerDownRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  subscribeToSupportTickets,
  updateSupportTicketStatus,
  addSupportTicketReply,
  type SupportTicket,
} from "@/integrations/firebase/support";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";

export function AdminSupportInbox() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [markResolvedOnReply, setMarkResolvedOnReply] = useState(true);
  const [submittingReply, setSubmittingReply] = useState(false);

  useEffect(() => {
    const unsub = subscribeToSupportTickets((data) => {
      setTickets(data);
      // Keep selectedTicket in sync
      if (selectedTicket) {
        const match = data.find((t) => t.id === selectedTicket.id);
        if (match) setSelectedTicket(match);
      }
    });
    return () => unsub();
  }, [selectedTicket]);

  const openCount = tickets.filter((t) => t.status === "open" || t.status === "pending").length;

  const filteredTickets = tickets.filter((t) => {
    if (filter === "open") return t.status === "open" || t.status === "pending";
    if (filter === "resolved") return t.status === "resolved" || t.status === "closed";
    return true;
  });

  async function handleStatusChange(ticket: SupportTicket, newStatus: SupportTicket["status"]) {
    try {
      await updateSupportTicketStatus(ticket.id, ticket.rtdbKey, newStatus);
      toast.success(`Ticket marked as ${newStatus}`);
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket({ ...selectedTicket, status: newStatus });
      }
    } catch {
      toast.error("Could not update ticket status.");
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicket) return;
    if (replyMessage.trim().length < 2) {
      toast.error("Please enter a response message.");
      return;
    }

    setSubmittingReply(true);
    try {
      const nextStatus = markResolvedOnReply ? "resolved" : "pending";
      await addSupportTicketReply(
        selectedTicket,
        replyMessage.trim(),
        "Xora Support Team",
        nextStatus,
      );
      toast.success("Reply sent! The user has been notified.");
      setReplyMessage("");
    } catch (err) {
      console.error("Failed to post reply:", err);
      toast.error("Could not send reply.");
    } finally {
      setSubmittingReply(false);
    }
  }

  return (
    <section
      id="support"
      className="scroll-mt-6 rounded-3xl border border-border/80 bg-card p-4 shadow-card sm:p-7"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Inbox className="size-3.5" />
            Customer Support Center
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold">User Support Inbox</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Read support requests, send in-app replies directly to users, and trigger user
            notifications.
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-surface p-1 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilter("open")}
            className={
              filter === "open"
                ? "flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-primary-foreground shadow-sm"
                : "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-muted-foreground hover:text-foreground"
            }
          >
            Open ({openCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("resolved")}
            className={
              filter === "resolved"
                ? "flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-primary-foreground shadow-sm"
                : "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-muted-foreground hover:text-foreground"
            }
          >
            Resolved
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={
              filter === "all"
                ? "flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-primary-foreground shadow-sm"
                : "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-muted-foreground hover:text-foreground"
            }
          >
            All ({tickets.length})
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Ticket List View (Always visible on desktop, hidden on mobile when a ticket is selected) */}
        <div
          className={`overflow-hidden rounded-2xl border border-border bg-surface ${
            selectedTicket ? "hidden lg:block" : "block"
          }`}
        >
          {filteredTickets.length > 0 ? (
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {filteredTickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                const replyCount = ticket.replies?.length || 0;
                return (
                  <button
                    type="button"
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={`w-full p-4 text-left transition-colors ${
                      isSelected
                        ? "bg-primary/10 border-l-4 border-l-primary"
                        : "hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-semibold text-primary uppercase">
                        {ticket.id}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {replyCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <MessageSquare className="size-2.5" /> {replyCount}
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            ticket.status === "open"
                              ? "bg-amber-500/10 text-amber-500"
                              : ticket.status === "resolved"
                                ? "bg-success/10 text-success"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {ticket.status}
                        </span>
                      </div>
                    </div>

                    <h4 className="mt-1 font-semibold text-sm line-clamp-1 text-foreground">
                      {ticket.subject}
                    </h4>

                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {ticket.message}
                    </p>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <User className="size-3 text-primary" />
                        {ticket.display_name || ticket.email || "User"}
                      </span>
                      <span>{timeAgo(ticket.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <Inbox className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-semibold">No tickets in this view</p>
              <p className="mt-1 text-xs text-muted-foreground">
                When users send support or feedback messages, they will appear here.
              </p>
            </div>
          )}
        </div>

        {/* Selected Ticket Details View (Full width on mobile when selected) */}
        <div
          className={`rounded-2xl border border-border bg-surface p-4 sm:p-5 ${
            !selectedTicket ? "hidden lg:block" : "block"
          }`}
        >
          {selectedTicket ? (
            <div className="space-y-4">
              {/* Mobile Back Button */}
              <div className="lg:hidden mb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTicket(null)}
                  className="rounded-xl gap-2 text-xs"
                >
                  <ArrowLeft className="size-3.5" /> Back to All Tickets
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <span className="font-mono text-xs font-bold text-primary">
                    {selectedTicket.id}
                  </span>
                  <h3 className="font-display text-lg font-semibold mt-0.5">
                    {selectedTicket.subject}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTicket.status !== "resolved" ? (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(selectedTicket, "resolved")}
                      className="rounded-full bg-success text-success-foreground hover:bg-success/90 h-8 px-3 text-xs"
                    >
                      <CheckCircle2 className="size-3.5" /> Mark Resolved
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange(selectedTicket, "open")}
                      className="rounded-full h-8 px-3 text-xs"
                    >
                      Reopen Ticket
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 bg-background p-3 rounded-xl border border-border">
                <div>
                  <span className="block font-medium text-foreground">From User:</span>
                  <span>{selectedTicket.display_name || "Anonymous"}</span>
                </div>
                <div>
                  <span className="block font-medium text-foreground">Email:</span>
                  <span>{selectedTicket.email || "No email provided"}</span>
                </div>
                <div>
                  <span className="block font-medium text-foreground">Category:</span>
                  <span className="capitalize">{selectedTicket.category}</span>
                </div>
                <div>
                  <span className="block font-medium text-foreground">Submitted:</span>
                  <span>{new Date(selectedTicket.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Initial User Message */}
              <div className="rounded-xl border border-border/80 bg-background p-4">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                  User Issue Message
                </span>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {selectedTicket.message}
                </p>
              </div>

              {/* Response History Thread */}
              {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-primary flex items-center gap-1.5">
                    <MessageSquare className="size-3.5" /> Responses (
                    {selectedTicket.replies.length})
                  </h4>

                  <div className="space-y-2.5">
                    {selectedTicket.replies.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-muted-foreground font-medium">
                          <span className="flex items-center gap-1.5 text-primary font-semibold">
                            <ShieldCheck className="size-3.5" /> {r.sender_name}
                          </span>
                          <span className="text-[10px]">{timeAgo(r.created_at)}</span>
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {r.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct In-App Reply Form */}
              <form onSubmit={handleSendReply} className="pt-3 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="admin-reply-input"
                    className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground flex items-center gap-1.5"
                  >
                    <CornerDownRight className="size-3.5 text-primary" /> Admin Response (Notifies
                    User)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={markResolvedOnReply}
                      onChange={(e) => setMarkResolvedOnReply(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary size-3.5"
                    />
                    Mark ticket resolved after reply
                  </label>
                </div>

                <textarea
                  id="admin-reply-input"
                  rows={3}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Type your response here... (This will appear on the user's notification page and support tab)"
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />

                <Button
                  type="submit"
                  disabled={submittingReply || !replyMessage.trim()}
                  className="w-full sm:w-auto h-10 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs gap-2"
                >
                  <Send className="size-3.5" />
                  {submittingReply ? "Sending response..." : "Send Response & Notify User"}
                </Button>
              </form>
            </div>
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center p-6">
              <MessageSquare className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-semibold">Select a support ticket</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Click any message on the left to read full details and respond directly.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
