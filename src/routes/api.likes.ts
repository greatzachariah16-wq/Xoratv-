import { createFileRoute } from "@tanstack/react-router";
import { getAuthenticatedUserId } from "@/server/session-auth";
import { queryRtdb } from "@/server/xseries-service-account";
import { recordUserEngagementAction } from "@/server/engagement-controller";

type PostRow = Record<string, unknown> & { like_count?: number };
type LikesRow = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function safeKey(value: string) {
  return value.replace(/[.#$[\]/]/g, "_");
}

export const Route = createFileRoute("/api/likes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getAuthenticatedUserId(request).catch(() => null);
        if (!userId) return json({ ok: false, error: "Sign in to like videos." }, 401);

        let body: { postId?: unknown; action?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid request body." }, 400);
        }

        const postId = typeof body.postId === "string" ? body.postId.trim() : "";
        const action = body.action;
        if (!postId || postId.length > 256 || (action !== "like" && action !== "unlike")) {
          return json({ ok: false, error: "Invalid like request." }, 400);
        }

        const safePostId = safeKey(postId);
        const safeUserId = safeKey(userId);
        const likePath = `likes/${safePostId}/${safeUserId}`;
        const postPath = `posts/${safePostId}`;

        try {
          const post = await queryRtdb(postPath) as PostRow | null;
          if (!post || typeof post !== "object") {
            return json({ ok: false, error: "This video is no longer available." }, 404);
          }

          const existing = await queryRtdb(likePath);
          const alreadyLiked = existing !== null && existing !== undefined;
          let changed = false;

          if (action === "like" && !alreadyLiked) {
            await queryRtdb(likePath, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ created_at: new Date().toISOString() }),
            });
            changed = true;
          } else if (action === "unlike" && alreadyLiked) {
            await queryRtdb(likePath, { method: "DELETE" });
            changed = true;
          }

          // Recount from the authoritative likes nodes so retries do not blindly
          // increment/decrement the displayed total.
          const likes = await queryRtdb(`likes/${safePostId}`) as LikesRow | null;
          const likeCount = likes && typeof likes === "object" ? Object.keys(likes).length : 0;
          const latestPost = await queryRtdb(postPath) as PostRow | null;
          if (latestPost && typeof latestPost === "object") {
            await queryRtdb(postPath, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...latestPost, like_count: likeCount }),
            });
          }

          if (changed && action === "like") {
            await recordUserEngagementAction(userId, "like", postId).catch((error) => {
              console.warn("[Likes API] Engagement tracking failed:", error instanceof Error ? error.message : "unknown error");
            });
          }

          return json({ ok: true, liked: action === "like", likeCount });
        } catch (error) {
          console.error("[Likes API]", error instanceof Error ? error.message : "Unknown error");
          return json({ ok: false, error: "Could not update your like. Please try again." }, 503);
        }
      },
    },
  },
});
