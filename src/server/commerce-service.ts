import crypto from "node:crypto";
import { queryRtdb, getLocalStore } from "./xseries-service-account";
import { debitWallet, creditWallet } from "./wallet-service";

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
};

export type Course = {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  price: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  contentPostId?: string | null;
  contentLockEnabled: boolean;
  contentLockCampaignId?: string | null;
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
  if (!res.ok) throw new Error(body?.message || "Unable to read MELE wallet.");
  return body;
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
  service: "data" | "course";
  courseId?: string | null;
  label: string;
  targetPath: string;
  clicks: number;
  createdAt: string;
  updatedAt: string;
};

function promotionLinkPath(token: string) { return "commerce/promotionLinks/" + token; }
function promotionToken() { return crypto.randomBytes(9).toString("base64url"); }

async function readPromotionLinks(): Promise<CreatorPromotionLink[]> {
  const raw = (await queryRtdb("commerce/promotionLinks")) as Record<string, CreatorPromotionLink> | CreatorPromotionLink[] | null;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : Object.values(raw)).filter(Boolean);
}

export async function createCreatorPromotionLink(params: { creatorId: string; service: "data" | "course"; courseId?: string | null; }): Promise<CreatorPromotionLink> {
  const creator = await getCreator(params.creatorId);
  if (!creator || creator.status !== "active") throw new Error("Creator account is not active.");
  const existingLinks = await getCreatorPromotionLinks(params.creatorId);
  const existing = existingLinks.find((link) =>
    link.service === params.service &&
    (params.service === "data" || link.courseId === String(params.courseId || "").trim()),
  );
  if (existing) return existing;

  let label = "Xora Data Plans";
  let targetPath = "/data";
  let courseId: string | null = null;
  if (params.service === "course") {
    courseId = String(params.courseId || "").trim();
    if (!courseId) throw new Error("A course is required for a course promotion link.");
    const course = (await getCreatorCourses(params.creatorId)).find((item) => item.id === courseId && item.status === "published");
    if (!course) throw new Error("That course is not available for this creator.");
    label = course.title;
    targetPath = "/learn?course=" + encodeURIComponent(course.id);
  }
  let token = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = promotionToken();
    if (!(await queryRtdb(promotionLinkPath(candidate)))) { token = candidate; break; }
  }
  if (!token) throw new Error("Could not generate a unique promotion link. Please try again.");
  const now = new Date().toISOString();
  const record: CreatorPromotionLink = { token, creatorId: params.creatorId, service: params.service, courseId, label, targetPath, clicks: 0, createdAt: now, updatedAt: now };
  await queryRtdb(promotionLinkPath(token), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
  return record;
}

export async function getCreatorPromotionLinks(creatorId: string): Promise<CreatorPromotionLink[]> {
  return (await readPromotionLinks()).filter((link) => link.creatorId === creatorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function getPromotionLink(token: string): Promise<CreatorPromotionLink | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  return (await queryRtdb(promotionLinkPath(token))) as CreatorPromotionLink | null;
}

export async function resolvePromotionLink(token: string) {
  const link = await getPromotionLink(token);
  if (!link) return null;
  const now = new Date().toISOString();
  await queryRtdb(promotionLinkPath(token), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clicks: Number(link.clicks || 0) + 1, updatedAt: now }) });
  const target = new URL(link.targetPath, "https://xoratv.local");
  target.searchParams.set("promo", link.token);
  return { ...link, targetPath: target.pathname + target.search };
}

async function resolveCreatorAttribution(code: string | null | undefined, service: "data" | "course", courseId?: string) {
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
export async function createDataOrder(params: {
  userId: string;
  catalogId: string;
  phoneNumber: string;
  referralCode?: string | null;
}) {
  const catalog = await getAdminDataCatalog(false);
  const selected = catalog.find((record) => record.catalogId === String(params.catalogId) && record.status === "published");
  if (!selected) throw new Error("The selected data plan is not currently available.");

  const phoneNumber = String(params.phoneNumber).replace(/\D/g, "");
  if (!/^0\d{10}$/.test(phoneNumber)) throw new Error("Enter a valid 11-digit Nigerian phone number.");
  const orderId = id("data");
  const referralCreatorId = await resolveCreatorAttribution(params.referralCode, "data");
  const debit = await debitWallet({ userId: params.userId, amount: selected.customerPrice, reference: orderId, description: `Data purchase: ${selected.data_size} ${selected.network}` });
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
    referralCode: params.referralCode || null,
    referralCreatorId,
    status: "paid",
    paymentMethod: "xora_wallet",
    walletTransactionId: debit.transaction.id,
    createdAt: new Date().toISOString(),
  };
  await queryRtdb(`commerce/dataOrders/${orderId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
  });
  return record;
}
export async function testMelePurchase(params: {
  network: MelePlan["network"];
  planId: number;
  phoneNumber: string;
}) {
  const plans = await getMelePlans(true);
  const plan = plans.find((p) => Number(p.plan_id) === Number(params.planId) && p.network === params.network);
  if (!plan) throw new Error("That plan is not in the current live MELE catalog.");
  const phoneNumber = String(params.phoneNumber).replace(/\D/g, "");
  if (!/^0\d{10}$/.test(phoneNumber)) throw new Error("Enter a valid 11-digit Nigerian phone number.");
  const reference = id("mele_test").slice(0, 75);
  const res = await meleFetch("/data/purchase", {
    method: "POST",
    body: JSON.stringify({ network: plan.network, phone_number: phoneNumber, plan_id: plan.plan_id, reference }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || `MELE purchase test failed (HTTP ${res.status}).`);
  return { reference, plan, phoneNumber, response: body };
}

export async function createCreatorProfile(params: {
  userId: string; displayName: string; username: string;
}) {
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
  await queryRtdb(`commerce/creators/${params.userId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
  });
  return record;
}

export async function getCreator(userId: string): Promise<CreatorProfile | null> {
  return (await queryRtdb(`commerce/creators/${userId}`)) as CreatorProfile | null;
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
  return (await getCreatorCourses()).filter((c) => c.status === "published");
}

export async function deleteCreatorCourse(courseId: string, creatorId: string): Promise<{ id: string; status: "archived" }> {
  const course = await queryRtdb(`commerce/courses/${courseId}`) as Course | null;
  if (!course) throw new Error("Course not found.");
  if (course.creatorId !== creatorId) throw new Error("You can only delete your own courses.");
  if (course.status === "archived") return { id: course.id, status: "archived" };

  // Keep the course record as an archived tombstone so historical purchases,
  // commissions and promotion attribution are not broken by a hard delete.
  const now = new Date().toISOString();
  await queryRtdb(`commerce/courses/${courseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "archived", updatedAt: now }),
  });

  // Disable promotion links for the deleted course so an old shared link
  // cannot continue sending customers to an unavailable product.
  const links = await readPromotionLinks();
  const matching = links.filter((link) => link.creatorId === creatorId && link.service === "course" && link.courseId === courseId);
  if (matching.length) {
    await writePromotionLinks(links.map((link) =>
      matching.some((item) => item.token === link.token)
        ? { ...link, status: "disabled", updatedAt: now }
        : link,
    ));
  }

  return { id: course.id, status: "archived" };
}

export async function saveCourse(params: {
  creatorId: string;
  title: string;
  description: string;
  price: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  contentPostId?: string | null;
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
    contentPostId: params.contentPostId || null,
    contentLockEnabled: false,
    contentLockCampaignId: null,
    status: "published",
    createdAt: now,
    updatedAt: now,
  };
  await queryRtdb(`commerce/courses/${course.id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(course),
  });
  return course;
}

export async function createCourseOrder(params: { userId: string; courseId: string; referralCode?: string | null }) {
  const courses = await getCreatorCourses();
  const course = courses.find((c) => c.id === params.courseId && c.status === "published");
  if (!course) throw new Error("Course is unavailable.");
  const orderId = id("course_order");
  const referralCreatorId = await resolveCreatorAttribution(params.referralCode, "course", course.id);
  const debit = await debitWallet({
    userId: params.userId,
    amount: course.price,
    reference: orderId,
    description: `Course purchase: ${course.title}`,
  });
  const record = {
    id: orderId,
    userId: params.userId,
    courseId: course.id,
    creatorId: course.creatorId,
    customerPrice: course.price,
    referralCode: params.referralCode || null,
    referralCreatorId,
    status: "paid",
    paymentMethod: "xora_wallet",
    walletTransactionId: debit.transaction.id,
    createdAt: new Date().toISOString(),
  };
  try {
    await queryRtdb("commerce/courseOrders/" + orderId, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
    });
  } catch (error) {
    await creditWallet({
      userId: params.userId,
      amount: course.price,
      reference: `refund-${orderId}`,
      description: `Refund for failed course order: ${course.title}`,
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
  const safe = {
    accountName: details.accountName.trim(),
    accountNumber: details.accountNumber.replace(/\D/g, "").slice(0, 20),
    bankName: details.bankName.trim(),
    updatedAt: new Date().toISOString(),
  };
  await queryRtdb(`commerce/payoutDetails/${userId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(safe),
  });
  return safe;
}

export async function getPayoutDetails(userId: string) {
  return await queryRtdb(`commerce/payoutDetails/${userId}`);
}

export async function getCreatorDashboard(userId: string) {
  const [creator, coursesRaw, dataOrdersRaw, courseOrdersRaw, commissionsRaw, payout] = await Promise.all([
    getCreator(userId),
    queryRtdb("commerce/courses"),
    queryRtdb("commerce/dataOrders"),
    queryRtdb("commerce/courseOrders"),
    queryRtdb("commerce/commissions"),
    getPayoutDetails(userId),
  ]);
  const courses = coursesRaw ? Object.values(coursesRaw as Record<string, Course>).filter((c) => c.creatorId === userId) : [];
  const dataOrders = dataOrdersRaw ? Object.values(dataOrdersRaw as Record<string, any>).filter((o) => o.referralCreatorId === userId || o.creatorId === userId) : [];
  const courseOrders = courseOrdersRaw ? Object.values(courseOrdersRaw as Record<string, any>).filter((o) => o.referralCreatorId === userId || o.creatorId === userId) : [];
  const commissions = commissionsRaw ? Object.values(commissionsRaw as Record<string, any>).filter((c) => c.creatorId === userId && c.status !== "reversed") : [];
  const successful = (o: any) => o.status === "success" || o.status === "paid" || o.status === "delivered";
  const totalSales = dataOrders.concat(courseOrders).filter(successful).reduce((n, o) => n + Number(o.customerPrice || 0), 0);
  const dataSales = dataOrders.filter(successful).reduce((n, o) => n + Number(o.customerPrice || 0), 0);
  const commission = commissions.reduce((n, c) => n + Number(c.amount || 0), 0);
  return {
    creator,
    stats: { balance: commission, totalSales, dataSales, commission },
    courses,
    dataOrders,
    courseOrders,
    payout,
    links: (await getCreatorPromotionLinks(userId)).map((link) => ({ ...link, path: "/s/" + link.token })),
  };
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
  cpaProvider: string;
  cpaOfferId: string;
  cpaContentLockUrl: string;
  cpaClickIdParameter?: string;
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
  if (!provider || !offerId || !contentLockUrl) {
    throw new Error("A CPA provider, offer ID and content-lock URL are required.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(contentLockUrl);
    if (parsedUrl.protocol !== "https:") throw new Error();
  } catch {
    throw new Error("CPA content-lock URL must be a valid HTTPS URL.");
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
      provider,
      offerId,
      contentLockUrl: parsedUrl.toString(),
      clickIdParameter: String(params.cpaClickIdParameter || "subid").trim() || "subid",
      postbackStatus: "not_configured",
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
  if (status === "active" && (!campaign.cpa.provider || !campaign.cpa.offerId || !campaign.cpa.contentLockUrl)) {
    throw new Error("A complete CPA offer is required before activating this discount.");
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
