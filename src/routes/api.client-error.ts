import { createFileRoute } from "@tanstack/react-router";

const MAX_BODY_BYTES = 12 * 1024;
const REPORT_INTERVAL_MS = 60_000;
const MAX_REPORTS_PER_INTERVAL = 24;
let reportWindowStartedAt = Date.now();
let reportsInWindow = 0;

export const Route = createFileRoute("/api/client-error")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > MAX_BODY_BYTES) {
          return Response.json({ ok: false }, { status: 413 });
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ ok: false }, { status: 400 });
        }

        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          return Response.json({ ok: false }, { status: 400 });
        }

        const report = payload as Record<string, unknown>;
        const route = typeof report.route === "string" ? report.route.slice(0, 100) : "";
        const message = typeof report.message === "string" ? report.message.slice(0, 1200) : "";
        if (route !== "/xsports" || !message) {
          return Response.json({ ok: false }, { status: 400 });
        }

        const now = Date.now();
        if (now - reportWindowStartedAt >= REPORT_INTERVAL_MS) {
          reportWindowStartedAt = now;
          reportsInWindow = 0;
        }
        if (reportsInWindow >= MAX_REPORTS_PER_INTERVAL) {
          return Response.json({ ok: false }, { status: 429 });
        }
        reportsInWindow += 1;

        const diagnostic = {
          route,
          name: typeof report.name === "string" ? report.name.slice(0, 120) : "RouteError",
          message,
          stack: typeof report.stack === "string" ? report.stack.slice(0, 6000) : undefined,
          userAgent: typeof report.userAgent === "string" ? report.userAgent.slice(0, 350) : undefined,
          capturedAt: new Date(now).toISOString(),
        };

        console.error("[XoraTV XSports client error]", JSON.stringify(diagnostic));
        return Response.json({ ok: true }, {
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
