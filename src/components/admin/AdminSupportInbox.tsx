import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Inbox,
  Mail,
  MessageSquare,
  ShieldAlert,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  subscribeToSupportTickets,
  updateSupportTicketStatus,
  type SupportTicket,
} from "@/integrations/firebase/support";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";

export function AdminSupportInbox() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  useEffect(() => {
    const unsub = subscribeToSupportTickets((data) => {
      setTickets(data);
    });
    return () => unsub();
  }, []);

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

  return (
    <section
      id="support"
      className="scroll-mt-6 rounded-3xl border border-border/80 bg-card p-5 shadow-card sm:p-7"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Inbox className="size-3.5" />
            Customer Support Center
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold">User Support Inbox</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            All user messages and report tickets submitted through the Support page land here in
            real-time.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilter("open")}
            className={
              filter === "open"
                ? "flex items-center gap-2 rounded-xl bg-primary px-3.5 py-1.5 text-primary-foreground shadow-sm"
                : "flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-muted-foreground hover:text-foreground"
            }
          >
            Open ({openCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("resolved")}
            className={
              filter === "resolved"
                ? "flex items-center gap-2 rounded-xl bg-primary px-3.5 py-1.5 text-primary-foreground shadow-sm"
                : "flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-muted-foreground hover:text-foreground"
            }
          >
            Resolved
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={
              filter === "all"
                ? "flex items-center gap-2 rounded-xl bg-primary px-3.5 py-1.5 text-primary-foreground shadow-sm"
                : "flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-muted-foreground hover:text-foreground"
            }
          >
            All ({tickets.length})
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Ticket List */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {filteredTickets.length > 0 ? (
            <div className="divide-y divide-border">
              {filteredTickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
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

        {/* Selected Ticket Details */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          {selectedTicket ? (
            <div className="space-y-4">
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
                      className="rounded-full bg-success text-success-foreground hover:bg-success/90"
                    >
                      <CheckCircle2 className="size-3.5" /> Mark Resolved
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange(selectedTicket, "open")}
                      className="rounded-full"
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
                  <a
                    href={`mailto:${selectedTicket.email}`}
                    className="text-primary hover:underline"
                  >
                    {selectedTicket.email || "No email provided"}
                  </a>
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

              <div className="rounded-xl border border-border/80 bg-background p-4">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                  Message Content
                </span>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {selectedTicket.message}
                </p>
              </div>

              {selectedTicket.email && (
                <div className="pt-2">
                  <Button asChild className="w-full h-10 rounded-xl">
                    <a
                      href={`mailto:${selectedTicket.email}?subject=Re: ${encodeURIComponent(selectedTicket.subject)} (${selectedTicket.id})`}
                    >
                      <Mail className="size-4" /> Reply via Email to {selectedTicket.email}
                    </a>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center p-6">
              <MessageSquare className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-semibold">Select a support ticket</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Click any message on the left to read full details and update resolution status.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
