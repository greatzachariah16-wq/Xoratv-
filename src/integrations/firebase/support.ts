import {
  push,
  ref,
  get,
  update,
  onValue,
  addNotificationForUser,
} from "@/integrations/firebase/rtdb";
import { isFirebaseConfigured, rtdb } from "@/integrations/firebase/config";

export type SupportCategory =
  "technical" | "account" | "billing" | "report" | "privacy" | "feedback" | "other";

export type SupportTicketReply = {
  id: string;
  sender: "admin" | "user";
  sender_name: string;
  message: string;
  created_at: number;
};

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
  replies?: SupportTicketReply[];
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
    const storedRecord = { ...record, rtdbKey: ticketRef.key };
    // Write the admin record and private customer mirror atomically.
    await update(ref(rtdb), {
      [`supportTickets/${ticketRef.key}`]: storedRecord,
      [`userSupportTickets/${ticket.user_id}/${ticketRef.key}`]: storedRecord,
    });
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
        replies: val.replies
          ? Array.isArray(val.replies)
            ? val.replies
            : Object.values(val.replies)
          : [],
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

export function subscribeToUserSupportTickets(
  userId: string,
  callback: (tickets: SupportTicket[]) => void,
): () => void {
  if (isFirebaseConfigured()) {
    const userTicketsRef = ref(rtdb, `userSupportTickets/${userId}`);
    const unsub = onValue(userTicketsRef, (snapshot) => {
      if (!snapshot.exists()) { callback([]); return; }
      const raw = snapshot.val() as Record<string, SupportTicket>;
      const list = Object.entries(raw).map(([key, value]) => ({
        ...value,
        rtdbKey: value.rtdbKey || key,
        replies: value.replies ? (Array.isArray(value.replies) ? value.replies : Object.values(value.replies)) : [],
      }));
      list.sort((a, b) => b.created_at - a.created_at);
      callback(list);
    });
    return unsub;
  }
  const readLocal = () => {
    const local = JSON.parse(localStorage.getItem("xora_support_tickets") || "[]") as SupportTicket[];
    callback(local.filter((ticket) => ticket.user_id === userId));
  };
  readLocal();
  const interval = setInterval(readLocal, 2000);
  return () => clearInterval(interval);
}

export async function addSupportTicketReply(
  ticket: SupportTicket,
  replyText: string,
  adminName = "Xora Support Team",
  newStatus: SupportTicket["status"] = "pending",
): Promise<SupportTicketReply> {
  const reply: SupportTicketReply = {
    id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sender: "admin",
    sender_name: adminName,
    message: replyText,
    created_at: Date.now(),
  };

  const updatedReplies = [...(ticket.replies || []), reply];
  const now = Date.now();

  if (isFirebaseConfigured()) {
    let keyToUpdate = ticket.rtdbKey;
    if (!keyToUpdate) {
      const snapshot = await get(ref(rtdb, "supportTickets"));
      if (snapshot.exists()) {
        const raw = snapshot.val() as Record<string, SupportTicket>;
        for (const [k, val] of Object.entries(raw)) {
          if (val.id === ticket.id) {
            keyToUpdate = k;
            break;
          }
        }
      }
    }

    if (keyToUpdate) {
      const patch = { replies: updatedReplies, status: newStatus, updated_at: now };
      await update(ref(rtdb, `supportTickets/${keyToUpdate}`), patch);
      if (ticket.user_id) {
        await update(ref(rtdb, `userSupportTickets/${ticket.user_id}/${keyToUpdate}`), patch);
      }
    }

    if (ticket.user_id && !ticket.user_id.startsWith("guest_")) {
      const notifId = `notif_sup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await addNotificationForUser(ticket.user_id, {
        id: notifId,
        user_id: ticket.user_id,
        actor_id: "xora_support_admin",
        kind: "support_reply",
        post_id: null,
        read: false,
        created_at: new Date().toISOString(),
        message: `Xora Support replied to "${ticket.subject}": ${replyText.slice(0, 90)}...`,
      });
    }
  } else {
    const local = JSON.parse(
      localStorage.getItem("xora_support_tickets") || "[]",
    ) as SupportTicket[];
    const updated = local.map((t) =>
      t.id === ticket.id
        ? { ...t, replies: updatedReplies, status: newStatus, updated_at: now }
        : t,
    );
    localStorage.setItem("xora_support_tickets", JSON.stringify(updated));

    const localNotifs = JSON.parse(localStorage.getItem("xora_notifications") || "[]");
    localNotifs.unshift({
      id: `notif_sup_${Date.now()}`,
      user_id: ticket.user_id,
      actor_id: "xora_support_admin",
      kind: "support_reply",
      post_id: null,
      read: false,
      created_at: new Date().toISOString(),
      message: `Xora Support replied to "${ticket.subject}": ${replyText.slice(0, 90)}...`,
    });
    localStorage.setItem("xora_notifications", JSON.stringify(localNotifs));
  }

  return reply;
}

export async function updateSupportTicketStatus(
  ticketId: string,
  rtdbKey: string | undefined,
  status: SupportTicket["status"],
): Promise<void> {
  if (isFirebaseConfigured()) {
    let key = rtdbKey;
    if (!key) {
      const snapshot = await get(ref(rtdb, "supportTickets"));
      if (snapshot.exists()) {
        const raw = snapshot.val() as Record<string, SupportTicket>;
        key = Object.entries(raw).find(([, value]) => value.id === ticketId)?.[0];
      }
    }
    if (key) {
      const ticketSnapshot = await get(ref(rtdb, `supportTickets/${key}`));
      if (ticketSnapshot.exists()) {
        const ticket = ticketSnapshot.val() as SupportTicket;
        const patch = { status, updated_at: Date.now() };
        await update(ref(rtdb, `supportTickets/${key}`), patch);
        if (ticket.user_id) {
          await update(ref(rtdb, `userSupportTickets/${ticket.user_id}/${key}`), patch);
        }
      }
    }
  } else {
    const local = JSON.parse(localStorage.getItem("xora_support_tickets") || "[]") as SupportTicket[];
    const updated = local.map((t) => t.id === ticketId ? { ...t, status, updated_at: Date.now() } : t);
    localStorage.setItem("xora_support_tickets", JSON.stringify(updated));
  }
}
