import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminSession } from "@/server/admin-auth";
import { rtdbGet, rtdbSet, sanitizePathKey } from "@/lib/fraud-guard/db";

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function authorized(request: Request) {
  return verifyAdminSession(request).valid;
}

export const Route = createFileRoute("/api/admin/fraud/unrestrict-account")({
  server: { handlers: { POST: async ({ request }) => {
    if (!authorized(request)) return reply({ ok: false, error: "Administrator session required." }, 401);
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return reply({ ok: false, error: "Invalid JSON body." }, 400); }
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId || userId.length > 200) return reply({ ok: false, error: "A valid userId is required." }, 400);
    const key = sanitizePathKey(userId);
    const ok = await rtdbSet(`fraud/accountRestrictions/${key}`, { userId, restricted: false, reason: "", updatedAt: new Date().toISOString(), updatedBy: "admin" });
    if (!ok) return reply({ ok: false, error: "Could not update restriction. Check database permissions." }, 503);
    return reply({ ok: true, message: "Restriction cleared.", userId });
  } } }
});
