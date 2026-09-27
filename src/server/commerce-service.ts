import crypto from "node:crypto";
import { queryRtdb, getLocalStore } from "./xseries-service-account";

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
  contentPostId?: string | null;
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
  return {
    catalogId: publicCatalogId("vtushare", [plan.bundleId, plan.networkId, plan.typeId]),
    network,
    data_size: plan.dataSize,
    plan_name: plan.typeName || plan.dataSize,
    validity: "",
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
  const [melePlans, vtusharePlans] = await Promise.all([getMelePlans(true), getVtusharePlans(true)]);
  const current = await readDataCatalog();
  const byId = new Map(current.map((record) => [record.catalogId, record]));
  let added = 0;
  let updated = 0;

  for (const [provider, plans] of [["mele", melePlans] as const, ["vtushare", vtusharePlans] as const]) {
    for (const plan of plans) {
      const publicPlan = provider === "mele" ? toPublicMelePlan(plan as MelePlan) : toPublicVtusharePlan(plan as VtusharePlan);
      if (!publicPlan) continue;
      const record = toCatalogRecord(provider, plan, byId.get(publicPlan.catalogId));
      if (!record) continue;
      if (byId.has(record.catalogId)) updated++; else added++;
      byId.set(record.catalogId, record);
    }
  }

  const records = [...byId.values()].sort((a, b) => {
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
  } else if (refresh) {
    records = (await syncDataCatalog()).records;
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
  const candidates = [body?.plans, body?.data, body?.result, body?.data?.plans, body?.result?.plans];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function normalizeVtusharePlan(p: any): VtusharePlan {
  return {
    bundleId: Number(p.id ?? p.bundle ?? p.bundle_id),
    networkId: Number(p.network_id ?? p.networkId ?? p.network),
    network: String(p.network_name ?? p.networkName ?? p.network ?? "").toUpperCase(),
    amount: Number(p.amount ?? p.price ?? p.charged_amount ?? 0),
    dataSize: String(p.data_size ?? p.dataSize ?? p.name ?? ""),
    typeId: Number(p.type_id ?? p.typeId ?? p.type),
    typeName: String(p.type_name ?? p.typeName ?? ""),
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
  const referralCreatorId = params.referralCode && params.referralCode.endsWith("_data") ? params.referralCode.slice(0, -5) : null;
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
    status: "awaiting_payment",
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

export async function saveCourse(params: {
  creatorId: string;
  title: string;
  description: string;
  price: number;
  thumbnailUrl?: string | null;
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
    contentPostId: params.contentPostId || null,
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
  const referralCreatorId = params.referralCode ? params.referralCode.split("_course_")[0] : null;
  const record = {
    id: orderId,
    userId: params.userId,
    courseId: course.id,
    creatorId: course.creatorId,
    customerPrice: course.price,
    referralCode: params.referralCode || null,
    referralCreatorId,
    status: "awaiting_payment",
    createdAt: new Date().toISOString(),
  };
  await queryRtdb("commerce/courseOrders/" + orderId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
  });
  return record;
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
    links: [
      ...courses.map((c) => ({ service: "course", label: c.title, code: `${userId}_${c.id}`, path: `/learn?course=${c.id}&ref=${userId}` })),
      { service: "data", label: "Xora Data Plans", code: `${userId}_data`, path: `/data?ref=${userId}` },
    ],
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
