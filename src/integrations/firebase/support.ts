import { push, ref, set } from "@/integrations/firebase/rtdb";
import { isFirebaseConfigured, rtdb } from "@/integrations/firebase/config";

export type SupportCategory =
  "technical" | "account" | "billing" | "report" | "privacy" | "feedback" | "other";

export type SupportTicket = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  category: SupportCategory;
  subject: string;
  message: string;
  status: "open" | "pending" | "resolved" | "closed";
  priority: "normal" | "high";
  created_at: number;
  updated_at: number;
};

function makeTicketId(): string {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `XORA-${stamp}-${random}`;
}

export async function createSupportTicket(
  ticket: Omit<SupportTicket, "id" | "status" | "priority" | "created_at" | "updated_at">,
): Promise<SupportTicket> {
  const now = Date.now();
  const record: SupportTicket = {
    ...ticket,
    id: makeTicketId(),
    status: "open",
    priority: ticket.category === "report" || ticket.category === "privacy" ? "high" : "normal",
    created_at: now,
    updated_at: now,
  };

  if (isFirebaseConfigured()) {
    const ticketRef = push(ref(rtdb, "supportTickets"));
    await set(ticketRef, record);
  } else {
    const existing = JSON.parse(
      localStorage.getItem("xora_support_tickets") || "[]",
    ) as SupportTicket[];
    localStorage.setItem("xora_support_tickets", JSON.stringify([record, ...existing]));
  }

  return record;
}
