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
  thumbnailUrl?: string | null; videoUrl?: string | null; contentPostId?: string | null;
  contentLockEnabled?: boolean; contentLockCampaignId?: string | null;
  status: string; createdAt: string; updatedAt: string;
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
export function purchasedCoursesQuery(userId?: string) {
  return queryOptions({
    queryKey: ["commerce", "purchased-courses", userId],
    enabled: Boolean(userId),
    queryFn: () => commerceFetch<{ok:true;courseIds:string[]}>(`/api/commerce/courses/purchased?userId=${encodeURIComponent(userId || "")}`),
  });
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


export type DiscountCampaign = {
  id: string;
  name: string;
  description?: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  appliesTo: "data" | "course" | "both";
  productIds: string[];
  startAt: string | null;
  endAt: string | null;
  maxRedemptions: number | null;
  status: "draft" | "active" | "paused" | "expired";
  cpaRequired: true;
  cpa: {
    provider: string;
    offerId: string;
    contentLockUrl: string;
    clickIdParameter: string;
    postbackStatus: "not_configured" | "ready";
  };
  redemptions: number;
  createdAt: string;
  updatedAt: string;
};

export function adminDiscountCampaignsQuery() {
  return queryOptions({
    queryKey: ["admin", "discount-campaigns"],
    queryFn: () => commerceFetch<{ok:true;campaigns:DiscountCampaign[]}>("/api/admin/commerce/discount-campaigns"),
  });
}


export type WalletTransaction = {
  id: string; type: "deposit" | "purchase" | "refund" | "adjustment";
  status: "pending" | "successful" | "failed" | "reversed";
  amount: number; currency: "NGN"; reference: string; description: string;
  createdAt: string; completedAt?: string | null; providerReference?: string | null;
};
export function walletQuery(userId?: string) {
  return queryOptions({
    queryKey: ["commerce", "wallet", userId],
    enabled: Boolean(userId),
    queryFn: () => commerceFetch<{ok:true;wallet:{userId:string;balance:number;currency:"NGN";transactions:WalletTransaction[]}}>(`/api/commerce/wallet?userId=${encodeURIComponent(userId || "")}`),
    refetchInterval: 5000,
  });
}
export function walletDepositStatusQuery(userId?: string, reference?: string | null) {
  return queryOptions({
    queryKey: ["commerce", "wallet-deposit", userId, reference],
    enabled: Boolean(userId && reference),
    queryFn: () => commerceFetch<{ok:true;deposit:{id:string;reference:string;amount:number;status:string;creditedAt:string|null}}>(`/api/commerce/wallet/deposit/status?userId=${encodeURIComponent(userId || "")}&reference=${encodeURIComponent(reference || "")}`),
    refetchInterval: 3000,
  });
}
