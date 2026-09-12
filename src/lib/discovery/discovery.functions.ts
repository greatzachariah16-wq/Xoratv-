import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ContentSource } from "./types";

const sourceSchema = z
  .object({
    source: z.enum(["internet_archive", "wikimedia_commons", "nasa_svs"]).optional(),
  })
  .optional();

async function assertAdmin(
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" },
    ) => PromiseLike<{ data: boolean | null; error: unknown }>;
  },
  userId: string,
) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admins only");
}

/** Admin-triggered discovery pass across the open sources. */
export const runDiscoveryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sourceSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { runDiscovery } = await import("./engine.server");
    const results = await runDiscovery(data?.source as ContentSource | undefined);
    return { results };
  });

/** Admin-triggered re-score of a single already-discovered post. */
export const rescorePostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { rescorePost } = await import("./engine.server");
    return rescorePost(data.postId);
  });
