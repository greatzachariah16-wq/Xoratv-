import crypto from "node:crypto";
import { queryRtdb, getLocalStore } from "./xseries-service-account";
import { debitWallet, creditWallet, getWallet } from "./wallet-service";
import { listSpecialPrizes, getCreatorSpecialPrizeEarnings, getCreatorSpecialPrizeAnalytics } from "./special-prizes-service";
import { calculateDataPurchaseQuote, getCpaWallet, redeemCpaPoints, refundCpaPoints } from "./offerwall-service";
import { deleteXoraContent, getXoraContent } from "./content-repository";
import { deleteCloudinaryVideo } from "./content-media-controller";

const MELE_BASE = "https://meledata.ng/api/v1/developer";

export type MelePlan = {
  plan_id: number;
  plan_code: string;
  network: "MTN" | "GLO" | "AIRTEL" | "9MOBILE";
  plan_name: string;
  data_size: string;
  validity: string;
  price: number;
};

export type CreatorProfile = {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  status: "pending" | "active" | "suspended";
  createdAt: string;
  updatedAt: string;
  featuredImageUrl?: string | null;
  channelBio?: string | null;
  featuredTitle?: string | null;
  featuredDescription?: string | null;
  showCourses?: boolean;
  showCommunity?: boolean;
};

export type CourseLesson = { title: string; videoUrl: string; videoPublicId?: string | null; order: number };

export type Course = {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  price: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  lessons?: CourseLesson[];
  contentPostId?: string | null;
  contentLockEnabled: boolean;
  contentLockCampaignId?: string | null;
  unlockPoints?: number | null;
  category?: string | null;
  level?: string | null;
  creatorDisplayName?: string | null;
  creatorUsername?: string | null;
  status: "draft" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
};

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
}

function apiKey() {
  return process.env.MELE_DATA_API_KEY?.trim() || "";
}

async function meleFetch(path: string, init?: RequestInit) {
  const key = apiKey();
  if (!key) throw new Error("MELE_DATA_API_KEY is not configured on the server.");
  return fetch(`${MELE_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": key,
      ...(init?.headers || {}),
    },
    signal: init?.signal || AbortSignal.timeout(15000),
  });
}

function extractMelePlans(body: any): unknown[] {
  // MELE's documented response is { plans: [...] }, but the live service can
  // wrap the catalogue in success/data/result envelopes. Walk the response
  // safely so the dashboard keeps working when that envelope changes.
  const seen = new Set<any>();
  const visit = (value: any, depth = 0): unknown[] => {
    if (depth > 5 || value == null || seen.has(value)) return [];
    if (Array.isArray(value)) return value;
    if (typeof value !== "object") return [];
    seen.add(value);

    const preferred = [
      value.plans,
      value.data?.plans,
      value.result?.plans,
      value.data?.data,
      value.result?.data,
      value.data,
      value.result,
    ];
    for (const candidate of preferred) {
      if (Array.isArray(candidate)) return candidate;
      const nested = visit(candidate, depth + 1);
      if (nested.length) return nested;
    }

    for (const candidate of Object.values(value)) {
      const nested = visit(candidate, depth + 1);
      if (nested.length) return nested;
    }
    return [];
  };
  return visit(body);
}

function normalizeMelePlan(p: any): MelePlan {
  return {
    plan_id: Number(p.plan_id ?? p.planId ?? p.id),
    plan_code: String(p.plan_code ?? p.planCode ?? p.code ?? ""),
    network: String(p.network ?? p.network_name ?? p.networkName ?? "").toUpperCase() as MelePlan["network"],
    plan_name: String(p.plan_name ?? p.planName ?? p.name ?? ""),
    data_size: String(p.data_size ?? p.dataSize ?? p.size ?? ""),
    validity: String(p.validity ?? p.duration ?? ""),
    price: Number(p.price ?? p.amount ?? p.api_price ?? 0),
  };
}

export async function getMelePlans(force = false): Promise<MelePlan[]> {
  if (!force) {
    const cached = (await queryRtdb("commerce/dataPlans")) as MelePlan[] | Record<string, MelePlan> | null;
    if (cached) {
      const plans = Array.isArray(cached) ? cached : Object.values(cached);
      if (plans.length) return plans;
    }
  }
  const res = await meleFetch("/data/plans");
  const body = await res.json().catch(() => null);
  const rawPlans = extractMelePlans(body);
  if (!res.ok || !rawPlans.length) {
    throw new Error(body?.message || "Unable to load MELE DATA plans.");
  }
  const plans = rawPlans
    .map(normalizeMelePlan)
    .filter((p) => Number.isFinite(p.plan_id) && Boolean(p.network));
  // The live MELE catalogue is the source of truth. A Firebase cache write
  // must never make an otherwise successful MELE request look like a failure.
  try {
    await queryRtdb("commerce/dataPlans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plans),
    });
  } catch {
    // Keep serving the live catalogue even if the optional cache is unavailable.
  }
  return plans;
}

export type VtusharePlan = {
  bundleId: number;
  networkId: number;
  network: string;
  amount: number;
  dataSize: string;
  typeId: number;
  typeName: string;
  validity?: string;
};

export type PublicDataPlan = {
  catalogId: string;
  network: "MTN" | "GLO" | "AIRTEL" | "9MOBILE";
  data_size: string;
  plan_name: string;
  validity: string;
  price: number;
};

function publicCatalogId(provider: "mele" | "vtushare", parts: Array<string | number>) {
  return crypto.createHash("sha256").update([provider, ...parts].join("|")).digest("hex").slice(0, 24);
}

function toPublicMelePlan(plan: MelePlan): PublicDataPlan {
  return {
    catalogId: publicCatalogId("mele", [plan.plan_id, plan.plan_code]),
    network: plan.network,
    data_size: plan.data_size,
    plan_name: plan.plan_name || plan.data_size,
    validity: plan.validity,
    price: plan.price,
  };
}

function toPublicVtusharePlan(plan: VtusharePlan): PublicDataPlan | null {
  const network = plan.network as PublicDataPlan["network"];
  if (!["MTN", "GLO", "AIRTEL", "9MOBILE"].includes(network)) return null;

  // Keep the same presentation contract as MELE:
  // data_size = the actual bundle size, plan_name = the provider plan family,
  // validity = the provider's supplied duration. Never invent a duration.
  return {
    catalogId: publicCatalogId("vtushare", [plan.bundleId, plan.networkId, plan.typeId]),
    network,
    data_size: plan.dataSize,
    plan_name: plan.typeName || plan.dataSize,
    validity: String((plan as any).validity ?? "").trim(),
    price: plan.amount,
  };
}

export type DataCatalogStatus = "draft" | "published" | "disabled";
export type DataCatalogRecord = {
  catalogId: string;
  provider: "mele" | "vtushare";
  providerPlan: MelePlan | VtusharePlan;
  network: PublicDataPlan["network"];
  data_size: string;
  plan_name: string;
  validity: string;
  providerCost: number;
  customerPrice: number;
  status: DataCatalogStatus;
  createdAt: string;
  updatedAt: string;
  lastProviderSyncAt: string;
  priceUpdatedAt: string;
};

function catalogPath() { return "commerce/dataCatalog"; }

function toCatalogRecord(provider: "mele" | "vtushare", plan: MelePlan | VtusharePlan, existing?: DataCatalogRecord): DataCatalogRecord | null {
  const publicPlan = provider === "mele"
    ? toPublicMelePlan(plan as MelePlan)
    : toPublicVtusharePlan(plan as VtusharePlan);
  if (!publicPlan) return null;
  const now = new Date().toISOString();
  const providerCost = publicPlan.price;
  return {
    catalogId: publicPlan.catalogId,
    provider,
    providerPlan: plan,
    network: publicPlan.network,
    data_size: publicPlan.data_size,
    plan_name: publicPlan.plan_name,
    validity: publicPlan.validity,
    providerCost,
    // Newly discovered plans always require explicit admin approval.
    // Existing status is preserved so an approved/disabled plan is never
    // silently republished by a provider catalogue refresh.
    customerPrice: existing?.customerPrice ?? providerCost,
    status: existing?.status ?? "draft",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastProviderSyncAt: now,
    priceUpdatedAt: existing?.priceUpdatedAt ?? now,
  };
}

async function readDataCatalog(): Promise<DataCatalogRecord[]> {
  const raw = (await queryRtdb(catalogPath())) as Record<string, DataCatalogRecord> | DataCatalogRecord[] | null;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean);
}

async function writeCatalog(records: DataCatalogRecord[]) {
  await queryRtdb(catalogPath(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(records.reduce<Record<string, DataCatalogRecord>>((acc, record) => {
      acc[record.catalogId] = record;
      return acc;
    }, {})),
  });
}

export async function syncDataCatalog(): Promise<{ records: DataCatalogRecord[]; added: number; updated: number }> {
  // Keep provider syncs independent. One provider being temporarily unavailable
  // must never prevent the other provider's live catalogue from reaching Xora's
  // admin pricing layer.
  const [meleResult, vtushareResult] = await Promise.allSettled([
    getMelePlans(true),
    getVtusharePlans(true),
  ]);
  const current = await readDataCatalog();
  const byId = new Map(current.map((record) => [record.catalogId, record]));
  let added = 0;
  let updated = 0;
  const providerPlans: Array<["mele" | "vtushare", Array<MelePlan | VtusharePlan>]> = [];

  if (meleResult.status === "fulfilled") {
    providerPlans.push(["mele", meleResult.value]);
  }
  if (vtushareResult.status === "fulfilled") {
    providerPlans.push(["vtushare", vtushareResult.value]);
  }

  if (!providerPlans.length) {
    const errors = [meleResult, vtushareResult]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason))
      .filter(Boolean);
    throw new Error(errors.join(" · ") || "Unable to load either data provider catalogue.");
  }

  for (const [provider, plans] of providerPlans) {
    for (const plan of plans) {
      const publicPlan = provider === "mele"
        ? toPublicMelePlan(plan as MelePlan)
        : toPublicVtusharePlan(plan as VtusharePlan);
      if (!publicPlan) continue;
      const record = toCatalogRecord(provider, plan, byId.get(publicPlan.catalogId));
      if (!record) continue;
      if (byId.has(record.catalogId)) updated++; else added++;
      byId.set(record.catalogId, record);
    }
  }

  const records = [...byId.values()].sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    if (a.network !== b.network) return a.network.localeCompare(b.network);
    return a.providerCost - b.providerCost;
  });
  await writeCatalog(records);
  return { records, added, updated };
}

export async function getAdminDataCatalog(refresh = false): Promise<DataCatalogRecord[]> {
  let records = await readDataCatalog();
  if (!records.length) {
    const synced = await syncDataCatalog();
    // First initialization is intentionally safe: provider plans are drafts until
    // an admin explicitly sets a Xora price and publishes them.
    records = synced.records;
    await writeCatalog(records);
  } else if (refresh || !records.some((record) => record.provider === "mele") || !records.some((record) => record.provider === "vtushare")) {
    // A catalogue can predate the second provider. In that case, simply opening
    // the pricing page must hydrate the missing provider instead of showing an
    // empty provider tab until the admin happens to press Refresh.
    records = (await syncDataCatalog()).records;
  }

  // One-time migration from the previous pricing behaviour. The old catalogue
  // automatically published every discovered plan; the new model requires
  // explicit approval, so convert those legacy publications to drafts once.
  const approvalMigration = await queryRtdb("commerce/dataCatalogApprovalV2");
  if (!approvalMigration) {
    const now = new Date().toISOString();
    const migrated = records.map((record) =>
      record.status === "published" ? { ...record, status: "draft" as const, updatedAt: now } : record,
    );
    await writeCatalog(migrated);
    await queryRtdb("commerce/dataCatalogApprovalV2", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ migratedAt: now }),
    });
    records = migrated;
  }

  return records;
}

export async function updateDataCatalogPrice(catalogId: string, customerPrice: number): Promise<DataCatalogRecord> {
  const price = Number(customerPrice);
  if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid Xora selling price.");
  const records = await readDataCatalog();
  const record = records.find((item) => item.catalogId === String(catalogId));
  if (!record) throw new Error("That data plan is not in the Xora catalogue.");
  const now = new Date().toISOString();
  const updated = { ...record, customerPrice: Math.round(price * 100) / 100, updatedAt: now, priceUpdatedAt: now };
  await writeCatalog(records.map((item) => item.catalogId === updated.catalogId ? updated : item));
  return updated;
}

export async function updateDataCatalogStatus(catalogId: string, status: DataCatalogStatus): Promise<DataCatalogRecord> {
  if (!["draft", "published", "disabled"].includes(status)) throw new Error("Invalid catalogue status.");
  const records = await readDataCatalog();
  const record = records.find((item) => item.catalogId === String(catalogId));
  if (!record) throw new Error("That data plan is not in the Xora catalogue.");
  const updated = { ...record, status, updatedAt: new Date().toISOString() };
  await writeCatalog(records.map((item) => item.catalogId === updated.catalogId ? updated : item));
  return updated;
}

export async function getPublicDataPlans(force = false): Promise<PublicDataPlan[]> {
  let catalog = await getAdminDataCatalog(false);
  // Existing live plans are published once when the pricing layer is first introduced,
  // preserving the existing customer catalogue while moving all future changes behind admin control.
  if (!catalog.length || force) {
    const synced = await syncDataCatalog();
    catalog = synced.records;
  }
  // The public catalogue is an allow-list: only explicitly published records
  // are exposed. Do not auto-select the cheapest provider or merge providers,
  // because admin approval is the source of truth for what Xora sells.
  return catalog
    .filter((record) => record.status === "published")
    .map((record) => ({
      catalogId: record.catalogId,
      network: record.network,
      data_size: record.data_size,
      plan_name: record.plan_name,
      validity: record.validity,
      price: record.customerPrice,
    }))
    .sort((a, b) => a.network.localeCompare(b.network) || a.price - b.price);
}

function vtushareAuth() {
  const email = process.env.VTUSHARE_EMAIL?.trim() || "";
  const password = process.env.VTUSHARE_PASSWORD?.trim() || "";
  if (!email || !password) throw new Error("VTUSHARE_EMAIL and VTUSHARE_PASSWORD are not configured on the server.");
  return Buffer.from(email + ":" + password).toString("base64");
}

async function vtushareFetch(path: string, init?: RequestInit) {
  const auth = vtushareAuth();
  return fetch("https://vtushare.com.ng" + path, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Basic " + auth,
      ...(init?.headers || {}),
    },
    signal: init?.signal || AbortSignal.timeout(15000),
  });
}

function extractVtusharePlans(body: any): unknown[] {
  if (Array.isArray(body)) return body;

  const isPlanLike = (value: any) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const hasId = ["id", "bundle_id", "bundleId", "bundle", "plan_id", "planId"].some((key) => value[key] != null);
    const hasPrice = ["amount", "price", "api_price", "reseller_price", "charged_amount"].some((key) => value[key] != null);
    const hasNetwork = ["network", "network_name", "networkName", "network_label"].some((key) => value[key] != null);
    return hasId && (hasPrice || hasNetwork);
  };

  const visited = new Set<any>();
  const queue: any[] = [body];
  let fallback: unknown[] = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      if (current.length && current.every((item) => isPlanLike(item))) return current;
      if (!fallback.length && current.length && current.every((item) => item && typeof item === "object")) fallback = current;
      continue;
    }

    const entries = Object.entries(current);
    for (const [key, value] of entries) {
      if (Array.isArray(value)) {
        if (value.length && value.every((item) => isPlanLike(item))) return value;
        if (/plans?|bundles?|catalog|packages?/i.test(key) && value.length) queue.unshift(value);
        else if (!fallback.length && value.length && value.every((item) => item && typeof item === "object")) fallback = value;
      } else if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return fallback;
}

function vtushareScalar(value: any): string {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.name ?? value.label ?? value.title ?? value.code ?? value.value ?? "").trim();
  }
  return String(value).trim();
}

function vtushareNumber(...values: any[]): number {
  for (const value of values) {
    const n = typeof value === "object" && value != null
      ? Number(value.id ?? value.value ?? value.code)
      : Number(value);
    if (Number.isFinite(n)) return n;
  }
  return Number.NaN;
}

function normalizeVtusharePlan(p: any): VtusharePlan {
  // VTUshare's catalogue is not shaped like MELE's catalogue. Normalize the
  // provider-specific fields into the same Xora model before anything reaches
  // the admin/customer UI. Nested network/type objects are accepted as well.
  const bundleText = [
    p.data_size, p.dataSize, p.bundle_name, p.bundleName, p.bundle_code,
    p.bundleCode, p.name, p.bundle, p.plan_name, p.planName,
  ].map(vtushareScalar).find(Boolean) || "";
  const rawTypeName = [
    p.type_name, p.typeName, p.type_name_display, p.typeNameDisplay,
    p.type?.name, p.type?.label,
  ].map(vtushareScalar).find((value) => value && !/^\d+$/.test(value)) || "";

  const sizeMatch = bundleText.match(/\b(\d+(?:\.\d+)?(?:GB|MB))\b/i);
  const dataSize = sizeMatch?.[1]
    ? sizeMatch[1].toUpperCase()
    : bundleText.replace(/[_-](?:AWOOF|SME|CG|DATA.?SHARE|DIRECT.?GIFTING).*$/i, "").trim();

  const bundleValidityMatch = bundleText.match(/(?:[_-]|\s)(\d+)\s*(?:D|DAYS?|DAY)\b/i);
  const validity = [
    p.validity, p.duration, p.validity_days, p.validityDays, p.days,
    p.duration_days, p.durationDays,
  ].map(vtushareScalar).find(Boolean) ||
    (bundleValidityMatch?.[1] ? bundleValidityMatch[1] + " days" : "");

  const familyMatch = bundleText.match(/(?:^|[_-\s])(AWOOF|SME|GIFTING|CG|DATA.?SHARE|DIRECT.?GIFTING|CORPORATE)(?:[_-\s]|$)/i);
  const typeName = rawTypeName ||
    familyMatch?.[1]?.replace(/_/g, " ").toUpperCase() ||
    bundleText;

  // VTUshare can expose both a carrier/network value and a separate
  // network_id used by the purchase endpoint. They are not necessarily the
  // same field, so resolve the carrier from the network value first while
  // preserving the actual purchase networkId separately.
  const rawNetworkValue =
    p.network?.id ??
    p.network ??
    p.network_code ??
    p.networkCode ??
    p.network_name ??
    p.networkName ??
    p.network_label ??
    p.operator?.id ??
    p.operator?.name ??
    "";

  const numericNetworkMap: Record<number, VtusharePlan["network"]> = {
    1: "GLO",
    2: "MTN",
    3: "9MOBILE",
    4: "AIRTEL",
  };

  const numericNetworkValue = vtushareNumber(rawNetworkValue);
  const networkText = [
    p.network_name, p.networkName, p.network_label, p.network?.name,
    p.operator?.name, rawNetworkValue,
  ].map(vtushareScalar).find(Boolean) || "";

  const network = Number.isFinite(numericNetworkValue)
    ? (numericNetworkMap[numericNetworkValue] || "")
    : (/9\\s*MOBILE|ETISALAT/i.test(networkText)
      ? "9MOBILE"
      : /AIRTEL/i.test(networkText)
        ? "AIRTEL"
        : /GLO/i.test(networkText)
          ? "GLO"
          : /MTN/i.test(networkText)
            ? "MTN"
            : "");

  const purchaseNetworkId = vtushareNumber(
    p.network_id,
    p.networkId,
    p.network_id_value,
    p.network?.id,
    p.network,
  );

  return {
    bundleId: vtushareNumber(p.id, p.bundle_id, p.bundleId, p.bundle),
    networkId: purchaseNetworkId,
    network,
    amount: vtushareNumber(p.amount, p.price, p.api_price, p.reseller_price, p.charged_amount),
    dataSize: dataSize || bundleText,
    typeId: vtushareNumber(p.type_id, p.typeId, p.type_id_value, p.type?.id, p.type),
    typeName,
    validity,
  };
}

export async function getVtusharePlans(force = false): Promise<VtusharePlan[]> {
  if (!force) {
    const cached = (await queryRtdb("commerce/vtusharePlans")) as VtusharePlan[] | Record<string, VtusharePlan> | null;
    if (cached) {
      const plans = Array.isArray(cached) ? cached : Object.values(cached);
      if (plans.length) return plans;
    }
  }
  const res = await vtushareFetch("/api/v1/getPlans", { method: "POST", body: "{}" });
  const body = await res.json().catch(() => null);
  const rawPlans = extractVtusharePlans(body);
  if (!res.ok || !rawPlans.length) throw new Error(body?.message || "Unable to load VTUshare plans.");
  const plans = rawPlans.map(normalizeVtusharePlan).filter(
    (p) => Number.isFinite(p.bundleId) && Number.isFinite(p.networkId) && Number.isFinite(p.typeId) && p.network,
  );
  try {
    await queryRtdb("commerce/vtusharePlans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plans),
    });
  } catch {}
  return plans;
}

export async function getVtushareAccount() {
  const res = await vtushareFetch("/api/user");
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || "Unable to read VTUshare account.");
  return body;
}

export async function getVtushareHealth() {
  const checkedAt = new Date().toISOString();
  try {
    const [plansResponse, accountResponse] = await Promise.all([
      vtushareFetch("/api/v1/getPlans", { method: "POST", body: "{}" }),
      vtushareFetch("/api/user"),
    ]);
    const plansBody = await plansResponse.json().catch(() => null);
    const accountBody = await accountResponse.json().catch(() => null);
    const plans = extractVtusharePlans(plansBody);
    if (!plansResponse.ok || !accountResponse.ok || !plans.length) {
      throw new Error(
        plansBody?.message ||
        accountBody?.message ||
        "VTUshare connection check failed.",
      );
    }
    return {
      connected: true,
      checkedAt,
      plansCount: plans.length,
      account: accountBody,
      credentialsConfigured: true,
    };
  } catch (error) {
    return {
      connected: false,
      checkedAt,
      credentialsConfigured: Boolean(process.env.VTUSHARE_EMAIL?.trim() && process.env.VTUSHARE_PASSWORD),
      error: error instanceof Error ? error.message : "VTUshare connection check failed.",
    };
  }
}

export async function testVtusharePurchase(params: {
  bundleId: number;
  networkId: number;
  typeId: number;
  phoneNumber: string;
}) {
  if (process.env.VTUSHARE_LIVE_TEST_ENABLED !== "true") {
    throw new Error("VTUshare live testing is disabled on the server.");
  }
  const plans = await getVtusharePlans(true);
  const plan = plans.find(
    (p) => p.bundleId === Number(params.bundleId) &&
      p.networkId === Number(params.networkId) &&
      p.typeId === Number(params.typeId),
  );
  if (!plan) throw new Error("That VTUshare plan is not in the current live catalogue.");
  const phoneNumber = String(params.phoneNumber).replace(/\D/g, "");
  if (!/^0\d{10}$/.test(phoneNumber)) throw new Error("Enter a valid 11-digit Nigerian phone number.");
  const res = await vtushareFetch("/api/v1/buydata", {
    method: "POST",
    body: JSON.stringify({
      phone: phoneNumber,
      network: String(plan.networkId),
      bundle: String(plan.bundleId),
      type: String(plan.typeId),
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `VTUshare purchase test failed (HTTP ${res.status}).`);
  return { plan, phoneNumber, response: body };
}

export async function handleVtushareWebhook(request: Request) {
  const configuredSecret = process.env.VTUSHARE_WEBHOOK_SECRET?.trim();
  if (configuredSecret) {
    const supplied = request.headers.get("x-vtushare-webhook-secret") || request.headers.get("x-webhook-secret") || "";
    if (supplied !== configuredSecret) return { ok: false as const, status: 401, error: "Invalid webhook secret." };
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return { ok: false as const, status: 400, error: "Invalid webhook payload." };
  const payload = body as Record<string, any>;
  const reference = String(payload.ref || payload.reference || "").trim();
  if (!reference) return { ok: false as const, status: 400, error: "Webhook payload is missing a transaction reference." };
  const webhookId = id("vtushare_webhook");
  await queryRtdb(`commerce/vtushareWebhooks/${webhookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: webhookId, reference, payload, receivedAt: new Date().toISOString() }),
  });
  const orders = (await queryRtdb("commerce/dataOrders")) as Record<string, any> | null;
  const matched = Object.values(orders || {}).find(
    (order) => order?.vtushareReference === reference || order?.reference === reference,
  );
  if (matched?.id) {
    const providerStatus = String(payload.status || "").toLowerCase();
    const status = providerStatus === "success" ? "success" : providerStatus === "failed" ? "failed" : "processing";
    await queryRtdb(`commerce/dataOrders/${matched.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, providerStatus, webhookReceivedAt: new Date().toISOString(), vtushareWebhookId: webhookId }),
    });
  }
  return { ok: true as const, status: 200, reference, providerStatus: String(payload.status || ""), matchedOrderId: matched?.id || null };
}

export async function getMeleWallet() {
  const res = await meleFetch("/wallet/");
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false || body?.status === false) throw new Error(body?.message || `Unable to read MELE wallet (HTTP ${res.status}).`);
  return body;
}

/**
 * The single MELE purchase transport used by both the admin test and customer
 * Data Reward claims. Keep the endpoint, authentication, payload and response
 * parsing identical so a tested purchase path is the production purchase path.
 */
async function submitMelePurchase(params: {
  plan: MelePlan;
  phoneNumber: string;
  reference: string;
}) {
  const response = await meleFetch("/data/purchase", {
    method: "POST",
    body: JSON.stringify({
      network: params.plan.network,
      phone_number: params.phoneNumber,
      plan_id: params.plan.plan_id,
      reference: params.reference,
    }),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function getMeleDataPurchaseStatus(reference: string) {
  const res = await meleFetch(`/data/status/?ref=${encodeURIComponent(reference)}`, { method: "GET" });
  const body = await res.json().catch(() => null);
  if (res.status === 404) return { found: false, body, httpStatus: res.status };
  if (!res.ok) throw new Error(body?.message || `MELE status lookup failed (HTTP ${res.status}).`);
  return { found: true, body, httpStatus: res.status };
}

export async function refreshMeleDataRewardClaim(userId: string, reference: string) {
  const claim = await queryRtdb(dataRewardClaimPath(reference)) as any;
  if (!claim || claim.userId !== userId) throw new Error("Data reward claim not found.");
  if (["success", "failed"].includes(String(claim.status || ""))) return publicDataRewardClaim(claim);
  const result = await getMeleDataPurchaseStatus(reference);
  if (!result.found) {
    // MELE returned HTTP 404 for this exact idempotency reference. It has no
    // transaction to reconcile, so release the pending lock and allow a fresh
    // user-initiated attempt. Never infer this from a timeout or generic error.
    await settleMeleDataRewardClaim({
      reference,
      providerStatus: "not_found",
      providerPayload: { httpStatus: result.httpStatus, checkedAt: new Date().toISOString(), message: "MELE returned 404: no transaction exists for this reference." },
    });
    const latest = await queryRtdb(dataRewardClaimPath(reference)) as any;
    return publicDataRewardClaim(latest || claim);
  }
  const normalized = normalizeMeleRewardStatus(result.body);
  await settleMeleDataRewardClaim({
    reference,
    providerStatus: normalized.status || (normalized.succeeded ? "delivered" : normalized.failed ? "failed" : "processing"),
    providerPayload: result.body,
  });
  const latest = await queryRtdb(dataRewardClaimPath(reference)) as any;
  return publicDataRewardClaim(latest || claim);
}

export async function getMeleHealth() {
  const checkedAt = new Date().toISOString();
  try {
    const [walletResponse, plansResponse] = await Promise.all([
      meleFetch("/wallet/"),
      meleFetch("/data/plans"),
    ]);
    const walletBody = await walletResponse.json().catch(() => null);
    const plansBody = await plansResponse.json().catch(() => null);
    const walletData = walletBody?.data ?? walletBody ?? null;
    const plans = extractMelePlans(plansBody);
    const walletSuccess = walletBody?.success ?? walletBody?.status;
    const upstreamOk =
      walletResponse.ok &&
      plansResponse.ok &&
      walletSuccess !== false &&
      plans.length > 0;
    if (!upstreamOk) {
      const message =
        walletBody?.message ||
        plansBody?.message ||
        `MELE connection check failed (wallet HTTP ${walletResponse.status}, plans HTTP ${plansResponse.status}).`;
      throw new Error(message);
    }
    return {
      connected: true,
      checkedAt,
      mode: walletData?.mode ?? (walletData?.livemode ? "live" : "test"),
      livemode: Boolean(walletData?.livemode),
      balance: typeof walletData?.balance === "number" ? walletData.balance : Number(walletData?.balance || 0),
      display: walletData?.display ?? null,
      currency: walletData?.currency ?? "NGN",
      plansCount: plans.length,
      webhookConfigured: Boolean(process.env.MELE_WEBHOOK_SECRET?.trim()),
      walletHttpStatus: walletResponse.status,
      plansHttpStatus: plansResponse.status,
    };
  } catch (error) {
    return {
      connected: false,
      checkedAt,
      webhookConfigured: Boolean(process.env.MELE_WEBHOOK_SECRET?.trim()),
      error: error instanceof Error ? error.message : "MELE connection check failed.",
    };
  }
}

function webhookSecretIsValid(request: Request) {
  const expected = process.env.MELE_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const supplied =
    request.headers.get("x-mele-webhook-secret") ||
    request.headers.get("x-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  return supplied === expected;
}


const DATA_REWARD_TIERS = {
  "100mb": { size: "100 MB", points: 25, targetMb: 100 },
  "110mb": { size: "110 MB", points: 30, targetMb: 110 },
  "200mb": { size: "200 MB", points: 50, targetMb: 200 },
  "300mb": { size: "300 MB", points: 75, targetMb: 300 },
  "500mb": { size: "500 MB", points: 200, targetMb: 500 },
  "1gb": { size: "1 GB", points: 350, targetMb: 1024 },
} as const;

type DataRewardTierId = keyof typeof DATA_REWARD_TIERS;
type DataRewardNetwork = MelePlan["network"];

function dataRewardClaimPath(reference: string) {
  return `commerce/dataRewardClaims/${reference}`;
}

export async function updateCpaAccountWithEtag(
  userId: string,
  updater: (account: Record<string, any>) => Record<string, any>,
) {
  const { getCleanDbUrl, getFirebaseAccessToken } = await import("./xseries-service-account");
  const base = getCleanDbUrl();
  const token = await getFirebaseAccessToken();
  if (!base || !token) throw new Error("Secure Xora Points updates are unavailable right now.");
  const target = `${base}/commerce/cpaUsers/${encodeURIComponent(userId)}.json`;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const read = await fetch(`${target}?access_token=${encodeURIComponent(token)}`, {
      headers: { "X-Firebase-ETag": "true" },
      signal: AbortSignal.timeout(12000),
    });
    if (!read.ok) throw new Error(`Unable to read Xora Points (HTTP ${read.status}).`);
    const current = await read.json().catch(() => null) as Record<string, any> | null;
    const etag = read.headers.get("etag");
    const account = current && typeof current === "object"
      ? current
      : { userId, trackingId: "", points: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 };
    const updated = updater(account);
    const write = await fetch(`${target}?access_token=${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "if-match": etag || "null_etag",
      },
      body: JSON.stringify(updated),
      signal: AbortSignal.timeout(12000),
    });
    if (write.ok) return updated;
    if (write.status !== 412) throw new Error(`Unable to update Xora Points (HTTP ${write.status}).`);
  }
  throw new Error("Xora Points changed repeatedly. Please retry the claim.");
}

function parseDataRewardSizeMb(plan: MelePlan) {
  const text = `${plan.data_size} ${plan.plan_name}`.toLowerCase().replace(/,/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)\s*(gb|g|mb|m)\b/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return /^g/i.test(match[2]) ? amount * 1024 : amount;
}

function normalizeMeleRewardStatus(body: any) {
  const data = body?.data && typeof body.data === "object" ? body.data : body;
  const rawStatus = data?.status ?? data?.state ?? (typeof body?.status === "string" ? body.status : undefined) ?? body?.state;
  const status = String(rawStatus ?? "").trim().toLowerCase();
  const successFlag = typeof data?.success === "boolean" ? data.success
    : typeof body?.success === "boolean" ? body.success
    : typeof data?.status === "boolean" ? data.status
    : typeof body?.status === "boolean" ? body.status
    : undefined;
  const failed = successFlag === false || ["failed", "failure", "error", "rejected", "declined", "cancelled", "canceled", "not_found", "not-found"].includes(status);
  const succeeded = ["delivered", "success", "successful", "completed", "complete"].includes(status) ||
    (successFlag === true && !["pending", "processing", "queued", "initiated", "accepted", "in_progress"].includes(status));
  return { status, failed, succeeded };
}

async function updateDataRewardClaimRecord(reference: string, patch: Record<string, unknown>) {
  await queryRtdb(dataRewardClaimPath(reference), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...patch, updatedAt: new Date().toISOString() }),
  });
}


async function putRtdbRecordOnce(path: string, value: Record<string, unknown>) {
  const { getCleanDbUrl, getFirebaseAccessToken } = await import("./xseries-service-account");
  const base = getCleanDbUrl();
  const token = await getFirebaseAccessToken();
  if (!base || !token) throw new Error("Secure referral ledger writes are unavailable.");
  const target = `${base}/${path}.json`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const read = await fetch(`${target}?access_token=${encodeURIComponent(token)}`, {
      headers: { "X-Firebase-ETag": "true" },
      signal: AbortSignal.timeout(12000),
    });
    if (!read.ok) throw new Error(`Unable to read referral ledger (HTTP ${read.status}).`);
    const current = await read.json().catch(() => null);
    if (current) return { created: false, record: current };
    const write = await fetch(`${target}?access_token=${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "if-match": read.headers.get("etag") || "null_etag" },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(12000),
    });
    if (write.ok) return { created: true, record: value };
    if (write.status !== 412) throw new Error(`Unable to write referral ledger (HTTP ${write.status}).`);
  }
  throw new Error("Referral ledger changed repeatedly. Retry settlement.");
}

export async function attachCreatorReferralToUser(userId: string, referralToken: string | null | undefined) {
  const token = String(referralToken || "").trim();
  if (!userId || !/^[A-Za-z0-9_-]{10,40}$/.test(token)) return { attached: false, reason: "missing-or-invalid-token" as const };
  const existing = await queryRtdb(`commerce/creatorReferralAttributions/${encodeURIComponent(userId)}`) as any;
  if (existing?.creatorId) return { attached: false, existing: true, attribution: existing };
  const creatorId = await resolveCreatorAttribution(token, "data-reward");
  if (!creatorId || creatorId === userId) return { attached: false, reason: "invalid-or-self-referral" as const };
  const creator = await getCreator(String(creatorId));
  if (!creator || creator.status !== "active" || creator.userId === userId) return { attached: false, reason: "creator-inactive" as const };
  const now = new Date().toISOString();
  const attribution = {
    referredUserId: userId, creatorId: String(creatorId), referralToken: token,
    status: "pending", clickedAt: null, registeredAt: now, createdAt: now, updatedAt: now,
  };
  const result = await putRtdbRecordOnce(`commerce/creatorReferralAttributions/${encodeURIComponent(userId)}`, attribution);
  return { attached: Boolean(result.record?.creatorId), existing: !result.created, attribution: result.record };
}

async function recordSuccessfulDataRewardQualification(claim: any, completedAt: string) {
  const userId = String(claim?.userId || "");
  if (!userId) throw new Error("Successful data-reward claim is missing its user identity.");
  const attribution = await queryRtdb(`commerce/creatorReferralAttributions/${encodeURIComponent(userId)}`) as any;
  const creatorId = String(claim?.referralCreatorId || attribution?.creatorId || "");
  const successEvent = {
    reference: String(claim.reference),
    userId,
    creatorId: creatorId || null,
    status: "success",
    completedAt,
    points: Number(claim.points || 0),
    provider: "mele",
  };
  await putRtdbRecordOnce(`commerce/dataRewardSuccessEvents/${encodeURIComponent(String(claim.reference))}`, successEvent);
  if (!creatorId || creatorId === userId) return { referralQualified: false, duplicate: false };
  const creator = await getCreator(creatorId);
  if (!creator || creator.status !== "active" || creator.userId === userId) {
    return { referralQualified: false, duplicate: false };
  }
  const referralEvent = {
    referredUserId: userId,
    creatorId,
    amount: 50,
    currency: "NGN",
    firstSuccessfulClaimReference: String(claim.reference),
    status: "confirmed",
    earnedAt: completedAt,
    minimumWithdrawal: 500,
  };
  const result = await putRtdbRecordOnce(`commerce/creatorReferralClaims/${encodeURIComponent(userId)}`, referralEvent);
  if (attribution?.creatorId === creatorId) {
    await queryRtdb(`commerce/creatorReferralAttributions/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "eligible", firstSuccessfulClaimReference: String(claim.reference), qualifiedAt: completedAt, updatedAt: completedAt }),
    }).catch(() => undefined);
  }
  return { referralQualified: true, duplicate: !result.created, event: result.record };
}

function dataRewardTierForPlan(plan: MelePlan) {
  const sizeMb = parseDataRewardSizeMb(plan);
  return (Object.entries(DATA_REWARD_TIERS) as [DataRewardTierId, (typeof DATA_REWARD_TIERS)[DataRewardTierId]][])
    .find(([, tier]) => sizeMb === tier.targetMb) || null;
}

export async function settleMeleDataRewardClaim(params: {
  reference: string;
  providerStatus: string;
  providerPayload?: unknown;
}) {
  const claim = await queryRtdb(dataRewardClaimPath(params.reference)) as any;
  if (!claim?.userId) return { matched: false, status: "unmatched" as const };
  const status = String(params.providerStatus || "").trim().toLowerCase();
  const accountSnapshot = await queryRtdb(`commerce/cpaUsers/${encodeURIComponent(String(claim.userId))}`) as any;
  const accountClaim = accountSnapshot?.dataRewardClaim;
  const alreadySuccessful = claim.status === "success" ||
    accountSnapshot?.dataRewardLastClaim?.reference === params.reference ||
    (accountClaim?.reference === params.reference && accountClaim.status === "success");
  if (alreadySuccessful) {
    await updateDataRewardClaimRecord(params.reference, { status: "success", providerStatus: status || claim.providerStatus || "success" }).catch(() => null);
    const completedAt = String(claim.completedAt || accountSnapshot?.dataRewardLastClaim?.completedAt || new Date().toISOString());
    const qualification = await recordSuccessfulDataRewardQualification(claim, completedAt).catch((error) => ({ referralQualified: false, ledgerError: error instanceof Error ? error.message : String(error) }));
    return { matched: true, status: "success" as const, duplicate: true, qualification };
  }
  const alreadyFailed = claim.status === "failed" ||
    (accountClaim?.reference === params.reference && accountClaim.status === "failed");
  if (alreadyFailed && !["delivered", "success", "successful", "completed", "complete"].includes(status)) {
    await updateDataRewardClaimRecord(params.reference, { status: "failed", providerStatus: status || claim.providerStatus || "failed" }).catch(() => null);
    return { matched: true, status: "failed" as const, duplicate: true };
  }
  const succeeded = ["delivered", "success", "successful", "completed", "complete"].includes(status);
  const failed = ["failed", "failure", "error", "rejected", "declined", "cancelled", "canceled", "not_found", "not-found"].includes(status);
  const now = new Date().toISOString();

  if (succeeded) {
    const updated = await updateCpaAccountWithEtag(String(claim.userId), (account) => {
      const currentClaim = account.dataRewardClaim;
      if (currentClaim?.reference !== params.reference) {
        if (account.dataRewardLastClaim?.reference === params.reference) return account;
        throw new Error("The pending data reward no longer matches this provider reference.");
      }
      if (currentClaim.status === "success") return account;
      const points = Number(claim.points || currentClaim.points || 0);
      if (!Number.isFinite(points) || points < 0) throw new Error("The data reward points value is invalid.");
      const reservedPoints = currentClaim.pointsReserved ? points : 0;
      if (reservedPoints > Number(account.pendingPoints || 0)) {
        throw new Error("The data reward was delivered, but its reserved points need manual reconciliation.");
      }
      const completedClaim = {
        ...currentClaim,
        pointsReserved: false,
        status: "success",
        providerStatus: status,
        providerPayload: params.providerPayload ?? currentClaim.providerPayload ?? null,
        completedAt: now,
      };
      return {
        ...account,
        pendingPoints: Math.max(0, Number(account.pendingPoints || 0) - reservedPoints),
        lifetimeRedeemed: Number(account.lifetimeRedeemed || 0) + reservedPoints,
        dataRewardLastClaimAt: now,
        dataRewardLastClaim: completedClaim,
        dataRewardClaim: completedClaim,
        updatedAt: now,
      };
    });
    const finalClaim = updated.dataRewardClaim || updated.dataRewardLastClaim;
    await updateDataRewardClaimRecord(params.reference, {
      status: "success",
      providerStatus: status,
      providerPayload: params.providerPayload ?? claim.providerPayload ?? null,
      completedAt: finalClaim?.completedAt || now,
    }).catch(() => null);
    const qualification = await recordSuccessfulDataRewardQualification({ ...claim, ...finalClaim }, finalClaim?.completedAt || now).catch((error) => ({ referralQualified: false, ledgerError: error instanceof Error ? error.message : String(error) }));
    return { matched: true, status: "success" as const, duplicate: finalClaim?.completedAt !== now, qualification };
  }

  if (failed) {
    await updateCpaAccountWithEtag(String(claim.userId), (account) => {
      const currentClaim = account.dataRewardClaim;
      if (currentClaim?.reference !== params.reference || currentClaim.status === "success") return account;
      const reservedPoints = currentClaim.pointsReserved ? Number(currentClaim.points || 0) : 0;
      return {
        ...account,
        points: Number(account.points || 0) + reservedPoints,
        pendingPoints: Math.max(0, Number(account.pendingPoints || 0) - reservedPoints),
        dataRewardClaim: {
          ...currentClaim,
          pointsReserved: false,
          status: "failed",
          providerStatus: status,
          providerPayload: params.providerPayload ?? null,
          failedAt: now,
        },
        updatedAt: now,
      };
    });
    await updateDataRewardClaimRecord(params.reference, {
      status: "failed",
      providerStatus: status,
      providerPayload: params.providerPayload ?? claim.providerPayload ?? null,
      failedAt: now,
    }).catch(() => null);
    return { matched: true, status: "failed" as const };
  }

  await updateCpaAccountWithEtag(String(claim.userId), (account) => {
    const currentClaim = account.dataRewardClaim;
    if (currentClaim?.reference !== params.reference || currentClaim.status === "success" || currentClaim.status === "failed") return account;
    return {
      ...account,
      dataRewardClaim: {
        ...currentClaim,
        status: "provider_pending",
        providerStatus: status || "processing",
        providerPayload: params.providerPayload ?? currentClaim.providerPayload ?? null,
        updatedAt: now,
      },
      updatedAt: now,
    };
  });
  await updateDataRewardClaimRecord(params.reference, {
    status: "provider_pending",
    providerStatus: status || "processing",
    providerPayload: params.providerPayload ?? claim.providerPayload ?? null,
  }).catch(() => null);
  return { matched: true, status: "provider_pending" as const };
}

function publicDataRewardClaim(claim: any) {
  if (!claim || typeof claim !== "object") return null;
  return {
    reference: claim.reference || null,
    status: claim.status || null,
    rewardSize: claim.rewardSize || null,
    deliveredSize: claim.deliveredSize || null,
    points: Number(claim.points || 0),
    network: claim.network || null,
    providerStatus: claim.providerStatus || null,
    createdAt: claim.createdAt || null,
    completedAt: claim.completedAt || null,
    failedAt: claim.failedAt || null,
  };
}

export async function getDataRewardStatus(userId: string) {
  const [wallet, account] = await Promise.all([
    getCpaWallet(userId),
    queryRtdb(`commerce/cpaUsers/${encodeURIComponent(userId)}`) as Promise<any>,
  ]);
  const lastClaimAt = account?.dataRewardLastClaimAt || null;
  const lastClaimMs = lastClaimAt ? Date.parse(String(lastClaimAt)) : NaN;
  const cooldownUntil = Number.isFinite(lastClaimMs) ? new Date(lastClaimMs + 86400000).toISOString() : null;
  const cooldownRemainingMs = cooldownUntil ? Math.max(0, Date.parse(cooldownUntil) - Date.now()) : 0;
  const claim = publicDataRewardClaim(account?.dataRewardClaim);
  const pending = ["processing", "provider_pending"].includes(String(claim?.status || ""));
  return {
    wallet: { ...wallet, pendingPoints: Number(account?.pendingPoints || 0) },
    claim,
    lastClaim: publicDataRewardClaim(account?.dataRewardLastClaim),
    cooldownUntil: cooldownRemainingMs > 0 ? cooldownUntil : null,
    cooldownRemainingMs,
    pending,
  };
}

export async function claimMeleDataReward(params: {
  userId: string;
  planId: number;
  network: DataRewardNetwork;
  phoneNumber: string;
  referralCode?: string | null;
}) {
  if (!["MTN", "GLO", "AIRTEL", "9MOBILE"].includes(params.network)) throw new Error("Choose a valid mobile network.");
  const phoneNumber = String(params.phoneNumber || "").replace(/\D/g, "");
  if (!/^0\d{10}$/.test(phoneNumber)) throw new Error("Enter a valid 11-digit Nigerian phone number.");

  let plans: MelePlan[];
  try { plans = await getMelePlans(true); }
  catch { throw new Error("Data plans are temporarily unavailable. Please try again shortly."); }
  const selected = plans.find((plan) => Number(plan.plan_id) === Number(params.planId) && plan.network === params.network);
  if (!selected) throw new Error("That data plan is no longer available. Refresh the plans and choose again.");

  const [existingReferral, savedAttribution] = await Promise.all([
    queryRtdb(`commerce/creatorReferralClaims/${encodeURIComponent(params.userId)}`),
    queryRtdb(`commerce/creatorReferralAttributions/${encodeURIComponent(params.userId)}`),
  ]) as any[];
  const resolvedCreatorId = existingReferral?.creatorId || savedAttribution?.creatorId || await resolveCreatorAttribution(params.referralCode, "data-reward");
  const referralCreator = resolvedCreatorId ? await getCreator(String(resolvedCreatorId)) : null;
  const referralCreatorId = referralCreator?.status === "active" && referralCreator.userId !== params.userId ? String(resolvedCreatorId) : null;
  const matchedTier = dataRewardTierForPlan(selected);
  if (!matchedTier) {
    throw new Error("Unsupported bundle. Choose 100 MB, 110 MB, 200 MB, 300 MB, 500 MB or 1 GB to redeem with Xora Points.");
  }
  const [tierId, tier] = matchedTier;
  const reference = id("xora_reward").slice(0, 70);
  const createdAt = new Date().toISOString();
  const claimRecord = {
    reference, userId: params.userId, tierId, rewardSize: selected.data_size, points: tier.points,
    pointsReserved: true, network: params.network, deliveredSize: selected.data_size, planId: selected.plan_id,
    planName: selected.plan_name, providerPrice: selected.price, phoneNumber, provider: "mele",
    referralCreatorId, status: "processing", createdAt, updatedAt: createdAt,
  };

  await updateCpaAccountWithEtag(params.userId, (account) => {
    if (["processing", "provider_pending"].includes(String(account.dataRewardClaim?.status || ""))) {
      throw new Error("Your previous data request is still being processed. Please wait for its delivery confirmation.");
    }
    const lastClaimMs = account.dataRewardLastClaimAt ? Date.parse(String(account.dataRewardLastClaimAt)) : NaN;
    if (Number.isFinite(lastClaimMs) && Date.now() < lastClaimMs + 86400000) {
      throw new Error(`You can request data again after ${new Date(lastClaimMs + 86400000).toLocaleString("en-NG")}.`);
    }
    const availablePoints = Number(account.points || 0);
    if (!Number.isFinite(availablePoints) || availablePoints < tier.points) {
      throw new Error(`You need ${tier.points} Xora Points for this bundle. Your available balance is ${Math.max(0, availablePoints)} points.`);
    }
    const hasPreviousSuccessfulClaim = Boolean(account.dataRewardLastClaimAt || account.dataRewardLastClaim?.status === "success");
    if (hasPreviousSuccessfulClaim && !existingReferral?.creatorId && !savedAttribution?.creatorId) claimRecord.referralCreatorId = null;
    return {
      ...account,
      points: availablePoints - tier.points,
      pendingPoints: Number(account.pendingPoints || 0) + tier.points,
      dataRewardClaim: claimRecord,
      updatedAt: createdAt,
    };
  });

  try {
    await queryRtdb(dataRewardClaimPath(reference), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(claimRecord) });
  } catch (error) {
    await updateCpaAccountWithEtag(params.userId, (account) => {
      if (account.dataRewardClaim?.reference !== reference) return account;
      const reserved = account.dataRewardClaim.pointsReserved ? Number(account.dataRewardClaim.points || 0) : 0;
      return {
        ...account,
        points: Number(account.points || 0) + reserved,
        pendingPoints: Math.max(0, Number(account.pendingPoints || 0) - reserved),
        dataRewardClaim: { ...account.dataRewardClaim, pointsReserved: false, status: "failed", failedAt: new Date().toISOString(), providerStatus: "claim_record_error" },
        updatedAt: new Date().toISOString(),
      };
    }).catch(() => null);
    throw error;
  }

  let body: any;
  try {
    const purchase = await testMelePurchase({ network: params.network, planId: selected.plan_id, phoneNumber, reference, allowHttpError: true });
    body = purchase.response;
    if (!purchase.httpOk && purchase.httpStatus < 500) {
      await settleMeleDataRewardClaim({ reference, providerStatus: "failed", providerPayload: body });
      return { status: "failed" as const, reference, rewardSize: selected.data_size, deliveredSize: selected.data_size, points: 0, message: "Your data request could not be completed. Your reserved points have been returned." };
    }
  } catch (error) {
    try {
      const lookup = await getMeleDataPurchaseStatus(reference);
      if (lookup.found) {
        body = lookup.body;
        const checked = normalizeMeleRewardStatus(body);
        if (checked.succeeded || checked.failed) {
          await settleMeleDataRewardClaim({ reference, providerStatus: checked.status || (checked.succeeded ? "delivered" : "failed"), providerPayload: body });
          return { status: checked.succeeded ? "success" as const : "failed" as const, reference, rewardSize: selected.data_size, deliveredSize: selected.data_size, points: 0, message: checked.succeeded ? `Your ${selected.data_size} bundle has been delivered.` : "Your data request could not be completed." };
        }
      }
    } catch { /* retain pending state if status cannot be checked */ }
    await settleMeleDataRewardClaim({ reference, providerStatus: "processing", providerPayload: { message: error instanceof Error ? error.message : "MELE response was interrupted." } }).catch(() => null);
    return { status: "provider_pending" as const, reference, rewardSize: selected.data_size, deliveredSize: selected.data_size, points: 0, message: "Delivery has not been confirmed yet. Check this request before trying again." };
  }

  let normalized = normalizeMeleRewardStatus(body);
  if (!normalized.failed && !normalized.succeeded) {
    try {
      const lookup = await getMeleDataPurchaseStatus(reference);
      if (lookup.found) {
        const checked = normalizeMeleRewardStatus(lookup.body);
        if (checked.failed || checked.succeeded) { body = lookup.body; normalized = checked; }
      }
    } catch { /* preserve original response */ }
  }
  if (normalized.failed) {
    await settleMeleDataRewardClaim({ reference, providerStatus: normalized.status || "failed", providerPayload: body });
    return { status: "failed" as const, reference, rewardSize: selected.data_size, deliveredSize: selected.data_size, points: 0, message: "Your data request could not be completed." };
  }
  if (normalized.succeeded) {
    await settleMeleDataRewardClaim({ reference, providerStatus: normalized.status || "success", providerPayload: body });
    return { status: "success" as const, reference, rewardSize: selected.data_size, deliveredSize: selected.data_size, points: 0, message: `Your ${selected.data_size} bundle has been delivered.` };
  }
  await settleMeleDataRewardClaim({ reference, providerStatus: normalized.status || "processing", providerPayload: body });
  return { status: "provider_pending" as const, reference, rewardSize: selected.data_size, deliveredSize: selected.data_size, points: 0, message: "Your data request is still processing. Check its status before trying again." };
}

export async function handleMeleWebhook(request: Request) {
  if (!webhookSecretIsValid(request)) {
    return { ok: false as const, status: 401, error: "Invalid webhook secret." };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, error: "Invalid webhook payload." };
  }

  const payload = body as Record<string, any>;
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const reference = String(data.reference || payload.reference || data.ref || payload.ref || "").trim();
  const providerStatus = String(data.status || payload.status || "").trim().toLowerCase();

  if (!reference) {
    return { ok: false as const, status: 400, error: "Webhook payload is missing a transaction reference." };
  }

  const webhookId = id("mele_webhook");
  await queryRtdb(`commerce/meleWebhooks/${webhookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: webhookId,
      reference,
      providerStatus,
      payload,
      receivedAt: new Date().toISOString(),
    }),
  });

  const rewardClaim = await queryRtdb(dataRewardClaimPath(reference)) as any;
  if (rewardClaim?.userId && rewardClaim?.reference === reference) {
    const rewardResult = await settleMeleDataRewardClaim({
      reference,
      providerStatus,
      providerPayload: payload,
    });
    return {
      ok: true as const,
      status: 200,
      reference,
      providerStatus,
      matchedOrderId: null,
      matchedRewardClaim: true,
      rewardClaimStatus: rewardResult.status,
    };
  }

  const orders = (await queryRtdb("commerce/dataOrders")) as Record<string, any> | null;
  const matched = Object.values(orders || {}).find(
    (order) => order?.meleReference === reference || order?.reference === reference,
  );

  if (matched?.id) {
    const normalizedStatus =
      providerStatus === "delivered" || providerStatus === "success"
        ? "success"
        : providerStatus === "failed"
          ? "failed"
          : "processing";
    await queryRtdb(`commerce/dataOrders/${matched.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: normalizedStatus,
        providerStatus,
        webhookReceivedAt: new Date().toISOString(),
        meleWebhookId: webhookId,
      }),
    });
  }

  return {
    ok: true as const,
    status: 200,
    reference,
    providerStatus,
    matchedOrderId: matched?.id || null,
  };
}

export type CreatorPromotionLink = {
  token: string;
  creatorId: string;
  service: "data" | "course" | "offer" | "special-prize" | "data-reward";
  courseId?: string | null;
  offerId?: string | null;
  specialPrizeId?: string | null;
  label: string;
  targetPath: string;
  clicks: number;
  createdAt: string;
  updatedAt: string;
  status?: "active" | "revoked";
  revokedAt?: string;
  revocationReason?: string;
};

function promotionLinkPath(token: string) { return "commerce/promotionLinks/" + token; }
function promotionToken() { return crypto.randomBytes(9).toString("base64url"); }

async function readPromotionLinks(): Promise<CreatorPromotionLink[]> {
  const raw = (await queryRtdb("commerce/promotionLinks")) as Record<string, CreatorPromotionLink> | CreatorPromotionLink[] | null;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean);
}

async function writePromotionLinks(links: CreatorPromotionLink[]): Promise<void> {
  const next: Record<string, CreatorPromotionLink> = {};
  for (const link of links) {
    if (link?.token) next[link.token] = link;
  }
  await queryRtdb("commerce/promotionLinks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  });
}

export async function createCreatorPromotionLink(params: { creatorId: string; service: "data" | "course" | "special-prize" | "data-reward"; courseId?: string | null; specialPrizeId?: string | null; }): Promise<CreatorPromotionLink> {
  const creator = await getCreator(params.creatorId);
  if (!creator || creator.status !== "active") throw new Error("Creator account is not active.");
  const courseIdInput = String(params.courseId || "").trim();
  const prizeIdInput = String(params.specialPrizeId || "").trim();
  if (params.service === "special-prize" && !prizeIdInput) throw new Error("Choose a special prize to promote.");
  // Validate the current offer before considering reuse of an older creator link.
  const activeSpecialPrize = params.service === "special-prize"
    ? (await listSpecialPrizes(false)).find((item) => item.id === prizeIdInput) || null
    : null;
  if (params.service === "special-prize" && !activeSpecialPrize) throw new Error("That special prize is no longer available. Refresh the offer list and choose an active offer.");
  const existingLinks = await getCreatorPromotionLinks(params.creatorId);
  const existing = existingLinks.find((link) =>
    link.service === params.service &&
    (params.service === "data" || params.service === "data-reward" || (params.service === "course" && link.courseId === courseIdInput) || (params.service === "special-prize" && link.specialPrizeId === prizeIdInput)),
  );
  if (existing) return existing;

  let label = params.service === "data-reward" ? "Xora Data Rewards" : "Xora Data Plans";
  let targetPath = params.service === "data-reward" ? "/data-rewards" : "/data";
  let courseId: string | null = null;
  let specialPrizeId: string | null = null;
  if (params.service === "course") {
    courseId = courseIdInput;
    if (!courseId) throw new Error("A course is required for a course promotion link.");
    const course = (await getCreatorCourses(params.creatorId)).find((item) => item.id === courseId && item.status === "published");
    if (!course) throw new Error("That course is not available for this creator.");
    label = course.title;
    targetPath = "/learn?course=" + encodeURIComponent(course.id);
  } else if (params.service === "special-prize") {
    specialPrizeId = prizeIdInput;
    // Use the already-validated current offer so edits to its snippet/title are
    // reflected without reusing links to a deleted offer.
    if (!activeSpecialPrize) throw new Error("That special prize is no longer available.");
    label = activeSpecialPrize.title;
    targetPath = "/special-prizes?offer=" + encodeURIComponent(activeSpecialPrize.id);
  }
  let token = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = promotionToken();
    if (!(await queryRtdb(promotionLinkPath(candidate)))) { token = candidate; break; }
  }
  if (!token) throw new Error("Could not generate a unique promotion link. Please try again.");
  const now = new Date().toISOString();
  if (params.service === "data-reward") targetPath = "/auth?mode=signup&ref=" + encodeURIComponent(token);
  const record: CreatorPromotionLink = { token, creatorId: params.creatorId, service: params.service, courseId, specialPrizeId, label, targetPath, clicks: 0, createdAt: now, updatedAt: now };
  await queryRtdb(promotionLinkPath(token), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
  return record;
}

export async function getCreatorPromotionLinks(creatorId: string): Promise<CreatorPromotionLink[]> {
  const links = await readPromotionLinks();
  // Existing links created before revocation support are reconciled against the
  // current catalogue. A deleted offer cannot remain in the creator's active list.
  const savedPrizes = await listSpecialPrizes(true);
  const savedPrizeIds = new Set(savedPrizes.map((prize) => prize.id));
  const staleLinks = links.filter((link) =>
    link?.service === "special-prize" &&
    link.status !== "revoked" &&
    Boolean(link.specialPrizeId) &&
    !savedPrizeIds.has(String(link.specialPrizeId)),
  );
  const revokedAt = new Date().toISOString();
  await Promise.all(staleLinks.map((link) =>
    queryRtdb(promotionLinkPath(link.token), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "revoked", revokedAt, revocationReason: "special-prize-deleted" }),
    }).catch(() => undefined),
  ));
  const staleTokens = new Set(staleLinks.map((link) => link.token));
  return links
    .filter((link) =>
      link.creatorId === creatorId &&
      link.status !== "revoked" &&
      !staleTokens.has(link.token) &&
      (link.service !== "special-prize" || savedPrizeIds.has(String(link.specialPrizeId || ""))),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function getPromotionLink(token: string): Promise<CreatorPromotionLink | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  return (await queryRtdb(promotionLinkPath(token))) as CreatorPromotionLink | null;
}

export async function getPromotionTarget(token: string) {
  const link = await getPromotionLink(token);
  if (!link) return null;
  if (link.service === "data") {
    return { token: link.token, service: "data" as const, label: link.label };
  }
  if (!link.courseId) return null;
  const course = await queryRtdb(`commerce/courses/${link.courseId}`) as Course | null;
  if (!course || course.status !== "published" || course.creatorId !== link.creatorId) return null;
  return {
    token: link.token,
    service: "course" as const,
    label: link.label,
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      price: course.price,
      thumbnailUrl: course.thumbnailUrl,
      videoUrl: course.videoUrl,
    },
  };
}

export async function resolvePromotionLink(token: string) {
  const link = await getPromotionLink(token);
  // Special Prize links are resolved only by the offer-aware redirect handler.
  // Never count or reuse a revoked token through the generic redirect fallback.
  if (!link || link.status === "revoked" || link.service === "special-prize") return null;
  const now = new Date().toISOString();
  await queryRtdb(promotionLinkPath(token), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clicks: Number(link.clicks || 0) + 1, updatedAt: now }) });
  const targetPath = link.service === "data-reward" ? "/auth" : link.service === "course" ? "/learn" : link.service === "offer" ? "/offers" : link.service === "special-prize" ? "/special-prizes" : "/data";
  const target = new URL(targetPath, "https://xoratv.local");
  if (link.service === "data-reward") {
    target.searchParams.set("mode", "signup");
    target.searchParams.set("ref", link.token);
  } else {
    target.searchParams.set("promo", link.token);
  }
  if (link.service === "offer" && link.offerId) target.searchParams.set("offer", link.offerId);
  if (link.service === "special-prize" && link.specialPrizeId) target.searchParams.set("offer", link.specialPrizeId);
  return { ...link, targetPath: target.pathname + target.search };
}

async function resolveCreatorAttribution(code: string | null | undefined, service: "data" | "course" | "data-reward", courseId?: string) {
  const token = String(code || "").trim();
  if (/^[A-Za-z0-9_-]{10,40}$/.test(token)) {
    const promotion = await getPromotionLink(token);
    if (promotion && promotion.service === service && (!courseId || promotion.courseId === courseId)) return promotion.creatorId;
  }
  // Promotion attribution is intentionally token-only. Legacy creator-ID/referral
  // formats are not accepted here so internal identifiers never become a public
  // attribution mechanism.
  return null;
}
export async function getDataPriceQuote(params: { userId: string; catalogId: string; usePoints?: boolean }) {
  const catalog = await getAdminDataCatalog(false);
  const selected = catalog.find((record) => record.catalogId === String(params.catalogId) && record.status === "published");
  if (!selected) throw new Error("The selected data plan is not currently available.");
  const wallet = await getCpaWallet(params.userId);
  const xoraWallet = await getWallet(params.userId);
  const quote = calculateDataPurchaseQuote({
    points: wallet.points,
    price: selected.customerPrice,
    usePoints: params.usePoints === true,
  });
  return {
    quote,
    plan: {
      catalogId: selected.catalogId,
      network: selected.network,
      data_size: selected.data_size,
      validity: selected.validity,
      price: selected.customerPrice,
    },
    wallet: {
      balance: xoraWallet.balance,
      required: quote.finalPrice,
      sufficient: xoraWallet.balance >= quote.finalPrice,
    },
  };
}

export async function createDataOrder(params: {
  userId: string;
  catalogId: string;
  phoneNumber: string;
  referralCode?: string | null;
  usePoints?: boolean;
}) {
  const catalog = await getAdminDataCatalog(false);
  const selected = catalog.find((record) => record.catalogId === String(params.catalogId) && record.status === "published");
  if (!selected) throw new Error("The selected data plan is not currently available.");

  const phoneNumber = String(params.phoneNumber).replace(/\D/g, "");
  if (!/^0\d{10}$/.test(phoneNumber)) throw new Error("Enter a valid 11-digit Nigerian phone number.");
  const orderId = id("data");
  const referralCreatorId = await resolveCreatorAttribution(params.referralCode, "data");
  const cpaWallet = await getCpaWallet(params.userId);
  const purchaseQuote = calculateDataPurchaseQuote({ points: cpaWallet.points, price: selected.customerPrice, usePoints: params.usePoints === true });
  const pointsDiscount = {
    discount: purchaseQuote.pointsDiscount,
    pointsToRedeem: purchaseQuote.pointsToRedeem,
    maxDiscount: purchaseQuote.maxDiscount,
    pointsNgnValue: purchaseQuote.pointsNgnValue,
  };
  const finalPrice = purchaseQuote.finalPrice;
  const debit = await debitWallet({ userId: params.userId, amount: finalPrice, reference: orderId, description: `Data purchase: ${selected.data_size} ${selected.network}${pointsDiscount.pointsToRedeem ? ` with ${pointsDiscount.pointsToRedeem} Xora Points` : ""}` });
  let pointsRedemption: { points: number; remainingPoints: number } | null = null;
  try {
    if (pointsDiscount.pointsToRedeem > 0) {
      pointsRedemption = await redeemCpaPoints({ userId: params.userId, points: pointsDiscount.pointsToRedeem, reference: orderId, purpose: "data_discount", description: `Data discount: ${selected.data_size} ${selected.network}` });
    }
  } catch (error) {
    await creditWallet({ userId: params.userId, amount: finalPrice, reference: `${orderId}_points_refund`, description: `Refund for failed Xora Points redemption: ${selected.data_size} ${selected.network}` });
    throw error;
  }
  const record = {
    id: orderId,
    userId: params.userId,
    planId: selected.provider === "mele" ? (selected.providerPlan as MelePlan).plan_id : (selected.providerPlan as VtusharePlan).bundleId,
    planCode: selected.provider === "mele" ? (selected.providerPlan as MelePlan).plan_code : String((selected.providerPlan as VtusharePlan).bundleId),
    network: selected.network,
    dataSize: selected.data_size,
    phoneNumber,
    provider: selected.provider,
    providerPlan: selected.providerPlan,
    providerCost: selected.providerCost,
    customerPrice: selected.customerPrice,
    pointsDiscount: pointsDiscount.discount,
    pointsRedeemed: pointsRedemption?.points || 0,
    finalPrice,
    referralCode: params.referralCode || null,
    referralCreatorId,
    status: "paid",
    paymentMethod: "xora_wallet",
    walletTransactionId: debit.transaction.id,
    createdAt: new Date().toISOString(),
  };
  try {
    await queryRtdb(`commerce/dataOrders/${orderId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
    });
  } catch (error) {
    if (pointsRedemption?.points) {
      await refundCpaPoints({
        userId: params.userId,
        points: pointsRedemption.points,
        reference: `${orderId}_order_refund`,
        purpose: "data_discount",
        description: `Refund for failed data order: ${selected.data_size} ${selected.network}`,
      });
    }
    await creditWallet({
      userId: params.userId,
      amount: finalPrice,
      reference: `${orderId}_order_record_refund`,
      description: `Refund for failed data order: ${selected.data_size} ${selected.network}`,
    });
    throw error;
  }
  return record;
}
export async function testMelePurchase(params: {
  network: MelePlan["network"];
  planId: number;
  phoneNumber: string;
  reference?: string;
  allowHttpError?: boolean;
}) {
  const plans = await getMelePlans(true);
  const plan = plans.find((p) => Number(p.plan_id) === Number(params.planId) && p.network === params.network);
  if (!plan) throw new Error("That plan is not in the current live MELE catalog.");
  const phoneNumber = String(params.phoneNumber).replace(/\D/g, "");
  if (!/^0\d{10}$/.test(phoneNumber)) throw new Error("Enter a valid 11-digit Nigerian phone number.");
  const reference = params.reference || id("mele_test").slice(0, 75);
  const { response, body } = await submitMelePurchase({ plan, phoneNumber, reference });
  if (!response.ok && !params.allowHttpError) throw new Error(body?.message || `MELE purchase test failed (HTTP ${response.status}).`);
  return { reference, plan, phoneNumber, response: body, httpOk: response.ok, httpStatus: response.status };
}

export async function createCreatorProfile(params: {
  userId: string; displayName: string; username: string;
}) {
  const creatorPath = `commerce/creators/${params.userId}`;
  // Channel registration is one-time. Returning the saved record prevents a
  // repeat visit or a delayed dashboard request from overwriting channel data.
  const existing = await queryRtdb(creatorPath) as CreatorProfile | null;
  if (existing) return existing;

  const now = new Date().toISOString();
  const record: CreatorProfile = {
    id: params.userId,
    userId: params.userId,
    displayName: params.displayName.trim(),
    username: params.username.trim().replace(/^@/, "").toLowerCase(),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await queryRtdb(creatorPath, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
  });
  return (await queryRtdb(creatorPath) as CreatorProfile | null) || record;
}

export async function getCreator(userId: string): Promise<CreatorProfile | null> {
  return (await queryRtdb(`commerce/creators/${userId}`)) as CreatorProfile | null;
}

export async function saveCreatorCustomization(userId: string, params: {
  channelBio?: string;
  featuredTitle?: string;
  featuredDescription?: string;
  showCourses?: boolean;
  showCommunity?: boolean;
}) {
  const creator = await getCreator(userId);
  if (!creator || creator.status !== "active") throw new Error("Creator account is not active.");
  const clean = {
    channelBio: String(params.channelBio ?? "").trim().slice(0, 280),
    featuredTitle: String(params.featuredTitle ?? "").trim().slice(0, 100),
    featuredDescription: String(params.featuredDescription ?? "").trim().slice(0, 240),
    showCourses: params.showCourses !== false,
    showCommunity: params.showCommunity !== false,
  };
  const updated: CreatorProfile = { ...creator, ...clean, updatedAt: new Date().toISOString() };
  await queryRtdb(`commerce/creators/${userId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated),
  });
  return updated;
}

export async function saveCreatorFeaturedImage(userId: string, featuredImageUrl: string) {
  const creator = await getCreator(userId);
  if (!creator || creator.status !== "active") throw new Error("Creator account is not active.");
  const url = String(featuredImageUrl || "").trim();
  if (!url || url.length > 2048) throw new Error("A valid featured image URL is required.");
  const updated: CreatorProfile = { ...creator, featuredImageUrl: url, updatedAt: new Date().toISOString() };
  await queryRtdb(`commerce/creators/${userId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated),
  });
  return updated;
}

export async function getCreatorCourses(creatorId?: string): Promise<Course[]> {
  const raw = (await queryRtdb("commerce/courses")) as Record<string, Course> | Course[] | null;
  if (!raw) return [];
  const courses = Array.isArray(raw) ? raw : Object.values(raw);
  return courses
    .filter((c) => (!creatorId || c.creatorId === creatorId) && c.status !== "archived")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPublishedCourses(): Promise<Course[]> {
  const [courses, creatorsRaw] = await Promise.all([
    getCreatorCourses(),
    queryRtdb("commerce/creators") as Promise<Record<string, CreatorProfile> | null>,
  ]);
  const creators = creatorsRaw || {};
  return courses.filter((course) => course.status === "published").map((course) => {
    const creator = creators[course.creatorId];
    return {
      ...course,
      creatorDisplayName: creator?.displayName || "Xora Creator",
      creatorUsername: creator?.username || "",
    };
  });
}

export async function deleteCreatorCourse(courseId: string, creatorId: string): Promise<{ id: string; status: "deleted"; promotionLinksRemoved: number; mediaDeleted: boolean }> {
  const course = await queryRtdb(`commerce/courses/${courseId}`) as Course | null;
  if (!course) throw new Error("Course not found.");
  if (course.creatorId !== creatorId) throw new Error("You can only delete your own courses.");

  const content = await getXoraContent(courseId);
  let mediaDeleted = true;

  // Delete the actual course video first. If this fails, keep the records intact so the
  // operation can be retried instead of leaving a half-deleted course behind.
  if (content?.cloudinaryPublicId) {
    await deleteCloudinaryVideo(content.cloudinaryPublicId);
  } else if (course.videoUrl) {
    mediaDeleted = false;
  }

  const links = await readPromotionLinks();
  const matching = links.filter((link) =>
    link.creatorId === creatorId && link.service === "course" && link.courseId === courseId
  );

  // Remove the course and its promotion links completely.
  await queryRtdb(`commerce/courses/${courseId}`, { method: "DELETE" });
  if (matching.length) {
    const tokens = new Set(matching.map((link) => link.token));
    await writePromotionLinks(links.filter((link) => !tokens.has(link.token)));
  }

  // Remove the course metadata from both MongoDB and Supabase.
  await deleteXoraContent(courseId);

  return {
    id: course.id,
    status: "deleted",
    promotionLinksRemoved: matching.length,
    mediaDeleted,
  };
}

export async function saveCourse(params: {
  creatorId: string;
  title: string;
  description: string;
  price: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  lessons?: Array<{ title?: string; videoUrl?: string; videoPublicId?: string | null; order?: number }>;
  contentPostId?: string | null;
  videoPublicId?: string | null;
  unlockPoints?: number | null;
  category?: string | null;
  level?: string | null;
}) {
  const now = new Date().toISOString();
  const course: Course = {
    id: id("course"),
    creatorId: params.creatorId,
    title: params.title.trim(),
    description: params.description.trim(),
    price: Math.max(0, Number(params.price) || 0),
    thumbnailUrl: params.thumbnailUrl || null,
    videoUrl: params.videoUrl || null,
    lessons: (params.lessons || []).filter((lesson) => lesson?.title?.trim() && lesson?.videoUrl).map((lesson, index) => ({ title: String(lesson.title).trim().slice(0, 120), videoUrl: String(lesson.videoUrl), videoPublicId: lesson.videoPublicId || null, order: index + 1 })),
    contentPostId: params.contentPostId || null,
    contentLockEnabled: false,
    contentLockCampaignId: null,
    unlockPoints: Math.max(1, Math.round(Number(params.unlockPoints) || Math.ceil(Math.max(0, Number(params.price) || 0) / 0.1))),
    category: String(params.category || "").trim().slice(0, 50) || null,
    level: String(params.level || "Beginner").trim().slice(0, 30),
    status: "published",
    createdAt: now,
    updatedAt: now,
  };
  await queryRtdb(`commerce/courses/${course.id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(course),
  });

  if (course.videoUrl) {
    try {
      await upsertXoraContent({
      id: course.id,
      firebaseId: course.id,
      contentType: "course",
      creatorId: course.creatorId,
      title: course.title,
      description: course.description,
      cloudinaryPublicId: params.videoPublicId || null,
      cloudinaryUrl: course.videoUrl,
      thumbnailUrl: course.thumbnailUrl,
      status: "ready",
      metadata: { price: course.price, contentLockEnabled: false, lessons: course.lessons || [] },
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      });
    } catch (error) {
      // The course is already safely stored in Firebase RTDB. Optional content indexing
      // must not turn a successful publish into a reported failure.
      console.warn("[Courses] Course saved but optional content index write failed:", error instanceof Error ? error.message : "unknown error");
    }
  }
  return course;
}

export async function createCourseOrder(params: { userId: string; courseId: string; referralCode?: string | null; paymentMethod?: "wallet" | "points" }) {
  const courses = await getCreatorCourses();
  const course = courses.find((c) => c.id === params.courseId && c.status === "published");
  if (!course) throw new Error("Course is unavailable.");

  // XoraTV courses are unlocked only with points earned through eligible CPA participation.
  // Never debit the user's cash wallet or create a monetary course sale.
  const orderId = id("course_order");
  const referralCreatorId = await resolveCreatorAttribution(params.referralCode, "course", course.id);
  const requiredPoints = Math.max(1, Math.round(Number(course.unlockPoints) || Math.ceil(Number(course.price || 0) / 0.1)));
  const pointsRedemption = await redeemCpaPoints({
    userId: params.userId,
    points: requiredPoints,
    reference: orderId,
    purpose: "course_unlock",
    description: `Course unlock: ${course.title}`,
  });
  const record = {
    id: orderId,
    userId: params.userId,
    courseId: course.id,
    creatorId: course.creatorId,
    customerPrice: 0,
    originalPrice: 0,
    pointsRedeemed: pointsRedemption.points,
    referralCode: params.referralCode || null,
    referralCreatorId,
    status: "paid",
    paymentMethod: "xora_points",
    walletTransactionId: null,
    createdAt: new Date().toISOString(),
  };
  try {
    await queryRtdb("commerce/courseOrders/" + orderId, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
    });
  } catch (error) {
    await refundCpaPoints({
      userId: params.userId,
      points: pointsRedemption.points,
      reference: orderId,
      description: `Refund for failed course unlock: ${course.title}`,
    }).catch(() => undefined);
    throw error;
  }
  return record;
}

export async function getUserPurchasedCourseIds(userId: string): Promise<string[]> {
  const raw = await queryRtdb("commerce/courseOrders") as Record<string, any> | any[] | null;
  const orders = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];
  return orders
    .filter((order: any) => order?.userId === userId && ["paid", "success", "delivered"].includes(String(order?.status)))
    .map((order: any) => String(order.courseId))
    .filter(Boolean);
}

export async function savePayoutDetails(userId: string, details: {
  accountName: string; accountNumber: string; bankName: string;
}) {
  const accountName = String(details.accountName || "").trim();
  const accountNumber = String(details.accountNumber || "").replace(/\D/g, "");
  const bankName = String(details.bankName || "").trim();
  if (!accountName || accountNumber.length !== 10 || !bankName) {
    throw new Error("Complete bank details are required: recipient name, 10-digit account number and bank.");
  }
  const safe = { userId, accountName, accountNumber, bankName, updatedAt: new Date().toISOString() };
  await queryRtdb(`commerce/payoutDetails/${userId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(safe),
  });
  return safe;
}

export async function getPayoutDetails(userId: string) {
  return await queryRtdb(`commerce/payoutDetails/${userId}`);
}

export async function getCreatorPayoutRequests(userId: string) {
  const raw = await queryRtdb("commerce/creatorPayoutRequests") as Record<string, any> | null;
  return Object.values(raw || {}).filter((item: any) => item?.creatorId === userId)
    .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function createCreatorPayoutRequest(userId: string, payoutType: "referral" | "special-prize") {
  const creator = await getCreator(userId);
  if (!creator || creator.status !== "active") throw new Error("Only active X Channel creators can request a payout.");
  const bank = await getPayoutDetails(userId) as any;
  if (!bank?.bankName || !/^\d{10}$/.test(String(bank.accountNumber || "")) || !String(bank.accountName || "").trim()) {
    throw new Error("Save complete bank details before requesting a payout.");
  }

  const [requestsRaw, referralRaw, rewardEventsRaw, conversionsRaw] = await Promise.all([
    queryRtdb("commerce/creatorPayoutRequests"),
    queryRtdb("commerce/creatorReferralClaims"),
    queryRtdb("commerce/dataRewardSuccessEvents"),
    queryRtdb("commerce/specialPrizeConversions"),
  ]);
  const requests = Object.values((requestsRaw || {}) as Record<string, any>).filter((x: any) => x?.creatorId === userId && x?.payoutType === payoutType);
  if (requests.some((x: any) => ["pending", "approved", "processing"].includes(String(x.status)))) {
    throw new Error("You already have an open request for this payout type.");
  }
  const paidTotal = requests.filter((x: any) => x.status === "paid").reduce((sum: number, x: any) => sum + Number(x.amount || 0), 0);

  let amount = 0;
  let currency: "NGN" | "USD";
  let minimum: number;
  if (payoutType === "referral") {
    currency = "NGN"; minimum = 500;
    const claims = Object.values((referralRaw || {}) as Record<string, any>).filter((x: any) => x?.creatorId === userId && x?.status === "confirmed");
    amount = claims.reduce((sum: number, x: any) => sum + Number(x.amount || 50), 0) - paidTotal;
  } else {
    currency = "USD"; minimum = 5;
    const conversions = Object.values((conversionsRaw || {}) as Record<string, any>).filter((x: any) => x?.creatorId === userId && x?.status === "approved" && String(x?.currency || "USD") === "USD");
    amount = conversions.reduce((sum: number, x: any) => sum + Number(x.creatorCommission || 0), 0) - paidTotal;
  }
  amount = Math.round(Math.max(0, amount) * 10000) / 10000;
  if (amount < minimum) throw new Error(`Minimum payout is ${currency === "NGN" ? "₦" : "$"}${minimum.toLocaleString()}.`);

  const requestId = id("creator_payout");
  const record = {
    id: requestId, creatorId: userId, creatorName: creator.displayName || creator.username,
    creatorUsername: creator.username, payoutType, amount, currency, minimum,
    bankDetails: { bankName: bank.bankName, accountNumber: String(bank.accountNumber), accountName: String(bank.accountName) },
    status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await queryRtdb(`commerce/creatorPayoutRequests/${requestId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
  });
  return record;
}

export async function getAdminCreatorPayoutRequests() {
  const raw = await queryRtdb("commerce/creatorPayoutRequests") as Record<string, any> | null;
  return Object.values(raw || {}).sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function getCreatorDashboard(userId: string) {
  const [creator, coursesRaw, dataOrdersRaw, courseOrdersRaw, commissionsRaw, payout, cpaStatsRaw, postsRaw, referralClaimsRaw, rewardEventsRaw, referralAttributionsRaw] = await Promise.all([
    getCreator(userId),
    queryRtdb("commerce/courses"),
    queryRtdb("commerce/dataOrders"),
    queryRtdb("commerce/courseOrders"),
    queryRtdb("commerce/commissions"),
    getPayoutDetails(userId),
    queryRtdb(`commerce/cpaCreatorStats/${userId}`),
    queryRtdb("posts"),
    queryRtdb("commerce/creatorReferralClaims"),
    queryRtdb("commerce/dataRewardSuccessEvents"),
    queryRtdb("commerce/creatorReferralAttributions"),
  ]);
  const courses = coursesRaw ? Object.values(coursesRaw as Record<string, Course>).filter((c) => c.creatorId === userId) : [];
  const dataOrders = dataOrdersRaw ? Object.values(dataOrdersRaw as Record<string, any>).filter((o) => o.referralCreatorId === userId || o.creatorId === userId) : [];
  const courseOrders = courseOrdersRaw ? Object.values(courseOrdersRaw as Record<string, any>).filter((o) => o.referralCreatorId === userId || o.creatorId === userId) : [];
  const commissions = commissionsRaw ? Object.values(commissionsRaw as Record<string, any>).filter((c) => c.creatorId === userId && c.status !== "reversed") : [];
  const creatorShorts = postsRaw
    ? Object.values(postsRaw as Record<string, any>)
        .filter((p) => p && p.author_id === userId && p.source === "creator" && p.kind === "video" && p.feed === "shorts" && p.status === "published")
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    : [];
  const successful = (o: any) => o.status === "success" || o.status === "paid" || o.status === "delivered";
  const totalSales = dataOrders.concat(courseOrders).filter(successful).reduce((n, o) => n + Number(o.customerPrice || 0), 0);
  const dataSales = dataOrders.filter(successful).reduce((n, o) => n + Number(o.customerPrice || 0), 0);
  const commission = commissions.reduce((n, c) => n + Number(c.amount || 0), 0);
  const referralClaims = Object.values((referralClaimsRaw || {}) as Record<string, any>).filter((event) => event?.creatorId === userId && event?.status === "confirmed");
  const referredUserIds = new Set(referralClaims.map((event) => String(event.referredUserId || "")));
  const referredSuccessEvents = Object.values((rewardEventsRaw || {}) as Record<string, any>).filter((event) => event?.creatorId === userId && referredUserIds.has(String(event.userId || "")) && event?.status === "success");
  const successfulClaimsByUser = new Map<string, number>();
  for (const event of referredSuccessEvents) successfulClaimsByUser.set(String(event.userId), (successfulClaimsByUser.get(String(event.userId)) || 0) + 1);
  const referralAttributions = Object.values((referralAttributionsRaw || {}) as Record<string, any>)
    .filter((event) => event?.creatorId === userId && event?.referredUserId);
  const eligibleUserIds = new Set(referralClaims.map((event) => String(event.referredUserId || "")));
  const pendingAttributions = referralAttributions
    .filter((event) => event.status !== "eligible" && !eligibleUserIds.has(String(event.referredUserId)))
    .map((event) => ({ referredUserId: event.referredUserId, status: "pending", registeredAt: event.registeredAt || event.createdAt }));
  const eligibleAttributions = referralClaims.map((event) => ({
    referredUserId: event.referredUserId, status: "eligible", registeredAt: referralAttributions.find((item) => item.referredUserId === event.referredUserId)?.registeredAt || null,
    qualifiedAt: event.earnedAt, amount: Number(event.amount || 50),
    successfulClaims: successfulClaimsByUser.get(String(event.referredUserId)) || 0,
    active: (successfulClaimsByUser.get(String(event.referredUserId)) || 0) >= 3,
  }));
  const dataRewardLinks = (await getCreatorPromotionLinks(userId)).filter((link) => link.service === "data-reward");
  const referralTracking = {
    clicks: dataRewardLinks.reduce((sum, link) => sum + Number(link.clicks || 0), 0),
    pending: pendingAttributions.length,
    eligible: eligibleAttributions.length,
    pendingMembers: pendingAttributions.sort((a, b) => String(b.registeredAt || "").localeCompare(String(a.registeredAt || ""))).slice(0, 50),
    eligibleMembers: eligibleAttributions.sort((a, b) => String(b.qualifiedAt || "").localeCompare(String(a.qualifiedAt || ""))).slice(0, 50),
  };
  const referralEarnings = {
    balance: referralClaims.reduce((sum, event) => sum + Number(event.amount || 0), 0),
    successfulReferrals: referralClaims.length,
    activeAudience: [...successfulClaimsByUser.values()].filter((count) => count >= 3).length,
    minimumWithdrawal: 500,
    currency: "NGN" as const,
    claims: referralClaims.map((event) => ({ referredUserId: event.referredUserId, amount: Number(event.amount || 50), earnedAt: event.earnedAt, successfulClaims: successfulClaimsByUser.get(String(event.referredUserId)) || 0, active: (successfulClaimsByUser.get(String(event.referredUserId)) || 0) >= 3 })),
  };
  return {
    creator,
    stats: { balance: commission, totalSales, dataSales, commission },
    courses,
    shorts: creatorShorts,
    dataOrders,
    courseOrders,
    payout,
    payoutRequests: await getCreatorPayoutRequests(userId),
    cpa: cpaStatsRaw || { approvedConversions: 0, pendingCommission: 0, payableCommission: 0, paidCommission: 0, minConversions: 200, payoutEligible: false },
    links: (await getCreatorPromotionLinks(userId)).map((link) => ({ ...link, path: "/s/" + link.token })),
    specialPrizeEarnings: await getCreatorSpecialPrizeEarnings(userId),
    specialPrizeAnalytics: await getCreatorSpecialPrizeAnalytics(userId),
    referralEarnings,
    referralTracking,
  };
}

export async function createCreatorPost(params: {
  userId: string;
  kind: "video" | "text";
  title: string | null;
  caption: string | null;
  mediaPath: string | null;
  posterPath: string | null;
  streamUrl: string | null;
  durationSeconds: number | null;
  specialPrizeId?: string | null;
  specialPrizeLinkToken?: string | null;
}) {
  const creator = await getCreator(params.userId);
  if (params.kind === "video" && (!creator || creator.status !== "active")) {
    throw new Error("Only active X Channel creators can publish Shorts.");
  }
  if (params.kind === "text" && !params.posterPath) {
    throw new Error("Add a picture to your post before publishing.");
  }
  if (params.kind === "video" && !params.streamUrl && !params.mediaPath) {
    throw new Error("The video upload is missing its playback URL.");
  }

  const postId = id("post");
  const createdAt = new Date().toISOString();
  const feed = params.kind === "video" ? "shorts" : "home";
  const record = {
    id: postId,
    author_id: params.userId,
    title: params.title,
    caption: params.caption,
    kind: params.kind,
    feed,
    status: "published",
    approval_status: "approved",
    media_path: params.mediaPath,
    poster_path: params.posterPath,
    stream_url: params.streamUrl,
    duration_seconds: params.durationSeconds,
    featured: false,
    recommendation_score: 90,
    source: "creator",
    created_at: createdAt,
    playability_status: params.kind === "video" ? "playable" : null,
    special_prize_id: params.specialPrizeId || null,
    special_prize_link_token: params.specialPrizeLinkToken || null,
  };

  // Use the server's Firebase service-account connection. The browser uses
  // Xora's custom Supabase session, not Firebase Authentication.
  await queryRtdb(`posts/${postId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  await queryRtdb(`postsByFeed/${feed}/${postId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      created_at: createdAt,
      recommendation_score: 90,
      status: "published",
      approval_status: "approved",
      source: "creator",
      kind: params.kind,
    }),
  });
  return record;
}

export async function deleteCreatorShort(postId: string, creatorId: string): Promise<{ id: string; deleted: true; mediaDeleted: boolean }> {
  const cleanPostId = String(postId || "").trim();
  const cleanCreatorId = String(creatorId || "").trim();
  if (!cleanPostId || !cleanCreatorId) throw new Error("Post and creator are required.");

  const post = await queryRtdb(`posts/${cleanPostId}`) as any | null;
  if (!post) throw new Error("Short not found.");
  if (String(post.author_id || "") !== cleanCreatorId) throw new Error("You can only delete your own Shorts.");
  if (post.source !== "creator" || post.kind !== "video" || post.feed !== "shorts") throw new Error("That post is not a creator Short.");

  let mediaDeleted = false;
  const mediaUrl = String(post.media_path || post.stream_url || "");
  const cloudinaryMatch = mediaUrl.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/);
  if (cloudinaryMatch) {
    const parts = cloudinaryMatch[2].split("/").filter(Boolean);
    while (parts.length > 0) {
      const first = parts[0];
      const isVersion = /^v\d+$/.test(first);
      const looksLikeTransformation = !isVersion && (
        first.includes(",") || first.startsWith("h_") || first.startsWith("w_") ||
        first.startsWith("c_") || first.startsWith("q_") || first.startsWith("f_") ||
        first.startsWith("sp_") || first.startsWith("br_") || first.startsWith("vc_") ||
        first.startsWith("fl_") || first.startsWith("d_")
      );
      if (!looksLikeTransformation) break;
      parts.shift();
    }
    const publicId = parts.join("/").replace(/\.[a-zA-Z0-9]+$/, "");
    if (publicId) {
      try {
        await deleteCloudinaryVideo(publicId);
        mediaDeleted = true;
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Could not remove the video from Cloudinary.");
      }
    }
  }

  await queryRtdb(`posts/${cleanPostId}`, { method: "DELETE" });
  await queryRtdb(`postsByFeed/shorts/${cleanPostId}`, { method: "DELETE" });

  return { id: cleanPostId, deleted: true, mediaDeleted };
}

export async function recordCommission(params: {
  creatorId: string; orderId: string; source: "course" | "data"; amount: number; referralCode: string;
}) {
  const record = { id: id("commission"), ...params, status: "pending", createdAt: new Date().toISOString() };
  await queryRtdb(`commerce/commissions/${record.id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
  });
  return record;
}

export async function getAdminCommerceOverview() {
  const [creators, courses, dataOrders, courseOrders, commissions, payouts] = await Promise.all([
    queryRtdb("commerce/creators"), queryRtdb("commerce/courses"), queryRtdb("commerce/dataOrders"), queryRtdb("commerce/courseOrders"),
    queryRtdb("commerce/commissions"), queryRtdb("commerce/payoutDetails"),
  ]);
  return {
    creators: Object.values((creators || {}) as Record<string, unknown>),
    courses: Object.values((courses || {}) as Record<string, unknown>),
    dataOrders: Object.values((dataOrders || {}) as Record<string, unknown>),
    courseOrders: Object.values((courseOrders || {}) as Record<string, unknown>),
    commissions: Object.values((commissions || {}) as Record<string, unknown>),
    payoutDetails: Object.values((payouts || {}) as Record<string, unknown>),
  };
}


export type DiscountCampaignStatus = "draft" | "active" | "paused" | "expired";
export type DiscountType = "percentage" | "fixed";

export type DiscountCampaign = {
  id: string;
  name: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  appliesTo: "data" | "course" | "both";
  productIds: string[];
  startAt: string | null;
  endAt: string | null;
  maxRedemptions: number | null;
  status: DiscountCampaignStatus;
  cpaRequired: true;
  cpa: {
    provider: string | null;
    offerId: string | null;
    contentLockUrl: string | null;
    clickIdParameter: string | null;
    postbackStatus: "not_configured" | "ready";
  };
  redemptions: number;
  createdAt: string;
  updatedAt: string;
};

export type DiscountConversion = {
  id: string;
  campaignId: string;
  clickId: string | null;
  userId: string | null;
  transactionId: string;
  offerId: string | null;
  status: "approved" | "reversed" | "pending" | "rejected";
  payload: Record<string, unknown>;
  receivedAt: string;
};

function discountCampaignPath(idValue: string) {
  return `commerce/discountCampaigns/${idValue}`;
}

function discountConversionPath(idValue: string) {
  return `commerce/discountConversions/${idValue}`;
}

export async function getDiscountCampaigns(): Promise<DiscountCampaign[]> {
  const raw = await queryRtdb("commerce/discountCampaigns") as Record<string, DiscountCampaign> | DiscountCampaign[] | null;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : Object.values(raw))
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createDiscountCampaign(params: {
  name: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  appliesTo: "data" | "course" | "both";
  productIds?: string[];
  startAt?: string | null;
  endAt?: string | null;
  maxRedemptions?: number | null;
  cpaProvider?: string | null;
  cpaOfferId?: string | null;
  cpaContentLockUrl?: string | null;
  cpaClickIdParameter?: string | null;
}): Promise<DiscountCampaign> {
  const name = String(params.name || "").trim();
  const provider = String(params.cpaProvider || "").trim();
  const offerId = String(params.cpaOfferId || "").trim();
  const contentLockUrl = String(params.cpaContentLockUrl || "").trim();
  const value = Number(params.discountValue);
  const maxRedemptions = params.maxRedemptions == null || params.maxRedemptions === ""
    ? null
    : Number(params.maxRedemptions);

  if (!name) throw new Error("Campaign name is required.");
  if (!["percentage", "fixed"].includes(params.discountType)) throw new Error("Invalid discount type.");
  if (!["data", "course", "both"].includes(params.appliesTo)) throw new Error("Invalid campaign target.");
  if (!Number.isFinite(value) || value <= 0) throw new Error("Discount value must be greater than zero.");
  if (params.discountType === "percentage" && value > 100) throw new Error("Percentage discount cannot exceed 100%.");
  if (maxRedemptions !== null && (!Number.isFinite(maxRedemptions) || maxRedemptions < 1)) throw new Error("Maximum redemptions must be a positive number.");
  let parsedUrl: URL | null = null;
  if (contentLockUrl) {
    try {
      parsedUrl = new URL(contentLockUrl);
      if (parsedUrl.protocol !== "https:") throw new Error();
    } catch {
      throw new Error("CPA content-lock URL must be a valid HTTPS URL.");
    }
  }

  const now = new Date().toISOString();
  const campaign: DiscountCampaign = {
    id: id("discount_campaign"),
    name,
    description: String(params.description || "").trim() || undefined,
    discountType: params.discountType,
    discountValue: Math.round(value * 100) / 100,
    appliesTo: params.appliesTo,
    productIds: Array.isArray(params.productIds) ? params.productIds.map(String).filter(Boolean) : [],
    startAt: params.startAt || null,
    endAt: params.endAt || null,
    maxRedemptions: maxRedemptions === null ? null : Math.floor(maxRedemptions),
    status: "draft",
    cpaRequired: true,
    cpa: {
      provider: provider || null,
      offerId: offerId || null,
      contentLockUrl: parsedUrl?.toString() || null,
      clickIdParameter: String(params.cpaClickIdParameter || "").trim() || null,
      postbackStatus: provider && offerId && parsedUrl ? "ready" : "not_configured",
    },
    redemptions: 0,
    createdAt: now,
    updatedAt: now,
  };

  await queryRtdb(discountCampaignPath(campaign.id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(campaign),
  });
  return campaign;
}

export async function updateDiscountCampaignStatus(idValue: string, status: DiscountCampaignStatus) {
  if (!["draft", "active", "paused", "expired"].includes(status)) throw new Error("Invalid campaign status.");
  const campaign = await queryRtdb(discountCampaignPath(idValue)) as DiscountCampaign | null;
  if (!campaign) throw new Error("Discount campaign not found.");
  if (status === "active" && (
    !campaign.cpa.provider ||
    !campaign.cpa.offerId ||
    !campaign.cpa.contentLockUrl ||
    campaign.cpa.postbackStatus !== "ready"
  )) {
    throw new Error("A complete CPA content-lock configuration is required before activating this discount.");
  }
  const updated = { ...campaign, status, updatedAt: new Date().toISOString() };
  await queryRtdb(discountCampaignPath(idValue), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, updatedAt: updated.updatedAt }),
  });
  return updated;
}

export async function recordDiscountPostback(params: {
  campaignId: string;
  transactionId: string;
  clickId?: string | null;
  userId?: string | null;
  offerId?: string | null;
  status: "approved" | "reversed" | "pending" | "rejected";
  payload: Record<string, unknown>;
}) {
  const transactionId = String(params.transactionId || "").trim();
  if (!transactionId) throw new Error("Postback transaction ID is required.");
  const campaign = await queryRtdb(discountCampaignPath(params.campaignId)) as DiscountCampaign | null;
  if (!campaign) throw new Error("Discount campaign not found.");

  const existing = await queryRtdb(discountConversionPath(transactionId)) as DiscountConversion | null;
  if (existing) return { duplicate: true, conversion: existing };

  const conversion: DiscountConversion = {
    id: transactionId,
    campaignId: campaign.id,
    clickId: params.clickId ? String(params.clickId) : null,
    userId: params.userId ? String(params.userId) : null,
    transactionId,
    offerId: params.offerId ? String(params.offerId) : null,
    status: params.status,
    payload: params.payload,
    receivedAt: new Date().toISOString(),
  };

  await queryRtdb(discountConversionPath(transactionId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conversion),
  });

  if (params.status === "approved") {
    await queryRtdb(discountCampaignPath(campaign.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updatedAt: new Date().toISOString() }),
    });
  }

  return { duplicate: false, conversion };
}
