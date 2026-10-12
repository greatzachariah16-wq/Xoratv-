import { createFileRoute } from "@tanstack/react-router";
import { handleSourceSearchRoute } from "@/server/source-search";

export const Route = createFileRoute("/api/source-search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = await handleSourceSearchRoute(request, new URL(request.url));
        return response || Response.json({ ok: false, error: "Not found." }, { status: 404 });
      },
    },
  },
});
