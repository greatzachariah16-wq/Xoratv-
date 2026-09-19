import { push, ref, set, get, update, onValue } from "@/integrations/firebase/rtdb";
import { isFirebaseConfigured, rtdb } from "@/integrations/firebase/config";

export type SupportCategory =
  "technical" | "account" | "billing" | "report" | "privacy" | "feedback" | "other";

export type SupportTicket = {
  id: string;
  rtdbKey?: string;
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
    await set(ticketRef, { ...record, rtdbKey: ticketRef.key });
  } else {
    const existing = JSON.parse(
      localStorage.getItem("xora_support_tickets") || "[]",
    ) as SupportTicket[];
    localStorage.setItem("xora_support_tickets", JSON.stringify([record, ...existing]));
  }

  return record;
}

export function subscribeToSupportTickets(
  callback: (tickets: SupportTicket[]) => void,
): () => void {
  if (isFirebaseConfigured()) {
    const ticketsRef = ref(rtdb, "supportTickets");
    const unsub = onValue(ticketsRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const raw = snapshot.val() as Record<string, SupportTicket>;
      const list = Object.entries(raw).map(([key, val]) => ({
        ...val,
        rtdbKey: key,
      }));
      list.sort((a, b) => b.created_at - a.created_at);
      callback(list);
    });
    return unsub;
  } else {
    const local = JSON.parse(
      localStorage.getItem("xora_support_tickets") || "[]",
    ) as SupportTicket[];
    callback(local);
    const interval = setInterval(() => {
      const updated = JSON.parse(
        localStorage.getItem("xora_support_tickets") || "[]",
      ) as SupportTicket[];
      callback(updated);
    }, 2000);
    return () => clearInterval(interval);
  }
}

export async function updateSupportTicketStatus(
  ticketId: string,
  rtdbKey: string | undefined,
  status: SupportTicket["status"],
): Promise<void> {
  if (isFirebaseConfigured()) {
    if (rtdbKey) {
      await update(ref(rtdb, `supportTickets/${rtdbKey}`), {
        status,
        updated_at: Date.now(),
      });
    } else {
      const snapshot = await get(ref(rtdb, "supportTickets"));
      if (snapshot.exists()) {
        const raw = snapshot.val() as Record<string, SupportTicket>;
        for (const [key, val] of Object.entries(raw)) {
          if (val.id === ticketId) {
            await update(ref(rtdb, `supportTickets/${key}`), {
              status,
              updated_at: Date.now(),
            });
            break;
          }
        }
      }
    }
  } else {
    const local = JSON.parse(
      localStorage.getItem("xora_support_tickets") || "[]",
    ) as SupportTicket[];
    const updated = local.map((t) =>
      t.id === ticketId ? { ...t, status, updated_at: Date.now() } : t,
    );
    localStorage.setItem("xora_support_tickets", JSON.stringify(updated));
  }
}
