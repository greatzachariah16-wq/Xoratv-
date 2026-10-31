import crypto from "node:crypto";
import { queryRtdb } from "./xseries-service-account";
import { getAdminDataCatalog, getMelePlans, type MelePlan } from "./commerce-service";
import { recordPeriodClaim } from "./engagement-controller";

const MELE_BASE = "https://meledata.ng/api/v1/developer";

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function meleApiKey() {
  return process.env.MELE_DATA_API_KEY?.trim() || "";
}

async function meleRequest(path: string, init?: RequestInit) {
  const key = meleApiKey();
  if (!key) throw new Error("MELE data provider is not configured.");
  return fetch(`${MELE_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": key,
      ...(init?.headers || {}),
    },
    signal: init?.signal || AbortSignal.timeout(20000),
  });
}

function readWalletBalance(body: any): number | null {
  const candidates = [
    body?.data?.balance, body?.balance,
    body?.data?.wallet?.balance, body?.wallet?.balance,
    body?.result?.balance, body?.result?.data?.balance,
    body?.data?.available_balance, body?.available_balance,
    body?.data?.wallet_balance, body?.wallet_balance,
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? Number(candidate.replace(/[^0-9.-]/g, "")) : Number(candidate);
    if (candidate !== undefined && candidate !== null && Number.isFinite(value)) return value;
  }
  return null;
}

function normalizePurchaseStatus(body: any): "success" | "processing" | "failed" {
  const data = body?.data && typeof body.data === "object" ? body.data : body;
  const status = String(data?.status ?? body?.status ?? "").trim().toLowerCase();
  if (body?.success === false || data?.success === false || ["failed", "failure", "rejected", "error"].includes(status)) return "failed";
  if (["pending", "processing", "queued", "in_progress"].includes(status)) return "processing";
  if (body?.success === true || data?.success === true || ["success", "successful", "delivered", "completed"].includes(status)) return "success";
  // MELE's purchase endpoint is synchronous for accepted transactions. A 2xx
  // response without a failure/pending state is treated as accepted success.
  return "success";
}

export async function getDataRewardPlans() {
  const catalog = await getAdminDataCatalog(false);
  return catalog
    .filter((item) => item.provider === "mele" && item.status === "published")
    .map((item) => ({
      catalogId: item.catalogId,
      network: item.network,
      dataSize: item.data_size,
      planName: item.plan_name,
      validity: item.validity,
    }))
    .sort((a, b) => a.network.localeCompare(b.network) || a.providerCost - b.providerCost);
}

export async function getUserDataRewardClaims(userId: string) {
  const raw = await queryRtdb("commerce/dataOrders") as Record<string, any> | null;
  return Object.values(raw || {})
    .filter((order) => order?.rewardType === "data_reward" && order?.userId === userId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 30)
    .map((order) => ({
      id: order.id,
      network: order.network,
      dataSize: order.dataSize,
      phoneNumber: order.phoneNumber,
      status: order.status,
      createdAt: order.createdAt,
      completedAt: order.completedAt || null,
      reference: order.meleReference || order.reference,
      message: order.status === "success" ? "Your data reward was fulfilled." : order.status === "failed" ? "The provider could not fulfil this reward." : "MELE is processing this data reward.",
    }));
}

export async function claimDataReward(params: {
  userId: string;
  catalogId: string;
  phoneNumber: string;
  idempotencyKey: string;
}) {
  const phoneNumber = String(params.phoneNumber || "").replace(/\D/g, "");
  if (!/^0\d{10}$/.test(phoneNumber)) throw new Error("Enter a valid 11-digit Nigerian phone number.");
  const idempotencyKey = String(params.idempotencyKey || "");
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new Error("Refresh the page and try claiming again.");

  const requestPath = `commerce/dataRewardRequests/${params.userId}/${idempotencyKey}`;
  const existingRequest = await queryRtdb(requestPath) as { orderId?: string } | null;
  if (existingRequest?.orderId) {
    const existingOrder = await queryRtdb(`commerce/dataOrders/${existingRequest.orderId}`);
    if (existingOrder) return existingOrder;
  }

  const catalog = await getAdminDataCatalog(false);
  const selected = catalog.find((item) => item.catalogId === params.catalogId && item.provider === "mele" && item.status === "published");
  if (!selected) throw new Error("That data reward is not currently available.");

  // Check the actual MELE provider wallet, not the user's Xora wallet.
  const walletResponse = await meleRequest("/wallet/");
  const walletBody = await walletResponse.json().catch(() => null);
  if (!walletResponse.ok) throw new Error(walletBody?.message || "Could not verify the MELE provider balance.");
  const walletData = walletBody?.data ?? walletBody;
  if (walletData?.livemode === false || String(walletData?.mode || "").toLowerCase() === "test") {
    throw new Error("MELE is currently in test mode. Live data rewards are paused until the provider account is switched to live mode.");
  }
  const providerBalance = readWalletBalance(walletBody);
  if (providerBalance === null) throw new Error("MELE did not return a readable wallet balance. No data reward was ordered.");
  const plan = (await getMelePlans(true)).find((item) => Number(item.plan_id) === Number((selected.providerPlan as MelePlan).plan_id) && item.network === selected.network);
  if (!plan) throw new Error("MELE no longer lists this bundle. Refresh the rewards catalogue and choose another plan.");
  const providerCost = Number(plan.price);
  if (!Number.isFinite(providerCost) || providerCost <= 0) throw new Error("This data reward has an invalid provider cost.");
  if (providerBalance < providerCost) throw new Error("The MELE provider balance is not sufficient for this data reward. Please try again later.");
  const orderId = makeId("data_reward");
  const reference = orderId.slice(0, 75);
  const now = new Date().toISOString();
  const order = {
    id: orderId,
    userId: params.userId,
    rewardType: "data_reward",
    provider: "mele",
    planId: plan.plan_id,
    planCode: plan.plan_code,
    network: selected.network,
    dataSize: selected.data_size,
    phoneNumber,
    providerCost,
    customerPrice: 0,
    paymentMethod: "xora_data_reward",
    reference,
    meleReference: reference,
    status: "processing",
    createdAt: now,
    updatedAt: now,
  };

  await queryRtdb(requestPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, createdAt: now }),
  });
  await queryRtdb(`commerce/dataOrders/${orderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });

  try {
    const response = await meleRequest("/data/purchase", {
      method: "POST",
      body: JSON.stringify({ network: plan.network, phone_number: phoneNumber, plan_id: plan.plan_id, reference }),
    });
    const providerResponse = await response.json().catch(() => null);
    if (!response.ok) {
      const failed = { ...order, status: "failed", providerStatus: providerResponse?.status || "http_error", providerMessage: providerResponse?.message || `MELE purchase failed (HTTP ${response.status}).`, updatedAt: new Date().toISOString() };
      await queryRtdb(`commerce/dataOrders/${orderId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(failed) });
      throw new Error(failed.providerMessage);
    }
    const status = normalizePurchaseStatus(providerResponse);
    const updated = {
      ...order,
      status,
      providerStatus: providerResponse?.data?.status || providerResponse?.status || (status === "success" ? "accepted" : "processing"),
      providerMessage: providerResponse?.message || null,
      providerResponse,
      updatedAt: new Date().toISOString(),
      completedAt: status === "success" ? new Date().toISOString() : null,
    };
    await queryRtdb(`commerce/dataOrders/${orderId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    if (status === "success") {
      await recordPeriodClaim(params.userId).catch((error) => console.error("[Data Rewards] Engagement count update failed:", error));
      await queryRtdb(`commerce/dataOrders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementRecordedAt: new Date().toISOString() }),
      });
    }
    return updated;
  } catch (error) {
    const latest = await queryRtdb(`commerce/dataOrders/${orderId}`) as any;
    if (latest?.status === "processing") {
      await queryRtdb(`commerce/dataOrders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerMessage: "The provider response could not be confirmed. Check claim history before retrying.", updatedAt: new Date().toISOString() }) });
    }
    throw error;
  }
}
