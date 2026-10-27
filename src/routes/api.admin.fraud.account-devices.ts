import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminSession } from "@/server/admin-auth";
import { rtdbGet, rtdbSet, sanitizePathKey } from "@/lib/fraud-guard/db";

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function authorized(request: Request) {
  return verifyAdminSession(request).valid;
}

export const Route = createFileRoute("/api/admin/fraud/account-devices")({
  server: { handlers: { GET: async ({ request }) => {
    if (!authorized(request)) return reply({ ok: false, error: "Administrator session required." }, 401);
    const data = await rtdbGet<Record<string, Record<string, Record<string, { lastSeenAt?: string; email?: string | null }>>>>("accountDevices");
    const records = Object.entries(data || {}).flatMap(([userId, days]) =>
      Object.entries(days || {}).flatMap(([day, devices]) =>
        Object.entries(devices || {}).map(([deviceId, value]) => ({
          userId, day, deviceId, lastSeenAt: value?.lastSeenAt || null, email: value?.email || null
        }))
      )
    ).sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""))).slice(0, 500);
    return reply({ ok: true, records });
  } } }
});
