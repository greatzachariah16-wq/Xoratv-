import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminSession } from "@/server/admin-auth";
import { rtdbGet, rtdbSet, sanitizePathKey } from "@/lib/fraud-guard/db";

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function authorized(request: Request) {
  return verifyAdminSession(request).valid;
}

export const Route = createFileRoute("/api/admin/fraud/notify-user")({
  server: { handlers: { POST: async ({ request }) => {
    if (!authorized(request)) return reply({ ok: false, error: "Administrator session required." }, 401);
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return reply({ ok: false, error: "Invalid JSON body." }, 400); }
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
    if (!userId || userId.length > 200 || !message) return reply({ ok: false, error: "A valid userId and message are required." }, 400);
    const id = crypto.randomUUID();
    const ok = await rtdbSet(`adminNotifications/${sanitizePathKey(userId)}/${id}`, { id, userId, message, category: "fraud_guard", createdAt: new Date().toISOString(), read: false });
    if (!ok) return reply({ ok: false, error: "Could not save notification. Check database permissions." }, 503);
    return reply({ ok: true, message: "Notification recorded.", notificationId: id });
  } } }
});
