import { queryOptions } from "@tanstack/react-query";

export type MelePlan = {
  plan_id: number; plan_code: string; network: "MTN" | "GLO" | "AIRTEL" | "9MOBILE";
  plan_name: string; data_size: string; validity: string; price: number;
};
export type Course = {
  id: string; creatorId: string; title: string; description: string; price: number;
  thumbnailUrl?: string | null; contentPostId?: string | null; status: string; createdAt: string; updatedAt: string;
};

export async function commerceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ok === false) throw new Error(body?.error || "Request failed");
  return body as T;
}
export function melePlansQuery(refresh = false) {
  return queryOptions({ queryKey: ["commerce","mele-plans",refresh], queryFn: () => commerceFetch<{ok:true;plans:MelePlan[]}>(`/api/commerce/data/plans${refresh ? "?refresh=1" : ""}`) });
}
export function coursesMarketQuery() {
  return queryOptions({ queryKey: ["commerce","courses"], queryFn: () => commerceFetch<{ok:true;courses:Course[]}>("/api/commerce/courses") });
}
export function creatorDashboardQuery(userId?: string) {
  return queryOptions({ queryKey: ["commerce","creator-dashboard",userId], enabled: Boolean(userId), queryFn: () => commerceFetch<{ok:true;dashboard:any}>(`/api/commerce/creator/dashboard?userId=${encodeURIComponent(userId || "")}`) });
}
export function adminCommerceQuery() {
  return queryOptions({ queryKey: ["admin","commerce"], queryFn: () => commerceFetch<{ok:true;overview:any}>("/api/admin/commerce/overview") });
}
