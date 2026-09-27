import { queryOptions } from "@tanstack/react-query";

export type MelePlan = {
  plan_id: number; plan_code: string; network: "MTN" | "GLO" | "AIRTEL" | "9MOBILE";
  plan_name: string; data_size: string; validity: string; price: number;
};
export type PublicDataPlan = {
  catalogId: string; network: "MTN" | "GLO" | "AIRTEL" | "9MOBILE";
  data_size: string; plan_name: string; validity: string; price: number;
};
export type VtusharePlan = {
  bundleId: number; networkId: number; network: string; amount: number;
  dataSize: string; typeId: number; typeName: string;
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
export function dataPlansQuery(refresh = false) {
  return queryOptions({ queryKey: ["commerce","data-plans",refresh], queryFn: () => commerceFetch<{ok:true;plans:PublicDataPlan[]}>(`/api/commerce/data/plans${refresh ? "?refresh=1" : ""}`) });
}
export const melePlansQuery = dataPlansQuery;
export function vtusharePlansQuery(refresh = false) {
  return queryOptions({
    queryKey: ["commerce", "vtushare-plans", refresh],
    queryFn: () => commerceFetch<{ok:true;plans:VtusharePlan[]}>(`/api/commerce/vtushare/plans${refresh ? "?refresh=1" : ""}`),
  });
}
export function vtushareHealthQuery() {
  return queryOptions({
    queryKey: ["admin", "vtushare-health"],
    queryFn: () => commerceFetch<{ok:true;health:any}>("/api/admin/commerce/vtushare-health"),
  });
}
export function coursesMarketQuery() {
  return queryOptions({ queryKey: ["commerce","courses"], queryFn: () => commerceFetch<{ok:true;courses:Course[]}>("/api/commerce/courses") });
}
export function creatorDashboardQuery(userId?: string) {
  return queryOptions({ queryKey: ["commerce","creator-dashboard",userId], enabled: Boolean(userId), queryFn: () => commerceFetch<{ok:true;dashboard:any}>(`/api/commerce/creator/dashboard?userId=${encodeURIComponent(userId || "")}`) });
}
export function meleHealthQuery() {
  return queryOptions({
    queryKey: ["admin", "mele-health"],
    queryFn: () => commerceFetch<{ ok: true; health: any }>("/api/admin/commerce/mele-health"),
  });
}
export type DataCatalogRecord = {
  catalogId: string;
  provider: "mele" | "vtushare";
  providerPlan: unknown;
  network: "MTN" | "GLO" | "AIRTEL" | "9MOBILE";
  data_size: string;
  plan_name: string;
  validity: string;
  providerCost: number;
  customerPrice: number;
  status: "draft" | "published" | "disabled";
  createdAt: string;
  updatedAt: string;
  lastProviderSyncAt: string;
  priceUpdatedAt: string;
};

export function adminDataCatalogQuery(refresh = false) {
  return queryOptions({
    queryKey: ["admin", "data-catalog", refresh],
    queryFn: () => commerceFetch<{ok:true;catalog:DataCatalogRecord[]}>(`/api/admin/commerce/data-catalog${refresh ? "?refresh=1" : ""}`),
  });
}

export function adminCommerceQuery() {
  return queryOptions({ queryKey: ["admin","commerce"], queryFn: () => commerceFetch<{ok:true;overview:any}>("/api/admin/commerce/overview") });
}
