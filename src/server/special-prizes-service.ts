import crypto from "node:crypto";
import { queryRtdb } from "./xseries-service-account";

export type SpecialPrize = {
  id: string;
  title: string;
  description: string;
  campaignId: string;
  currency: string;
  status: "active" | "paused";
  clicks: number;
  createdAt: string;
  updatedAt: string;
};

const prizesPath = "commerce/specialPrizes";

function cleanCampaignId(value: unknown) {
  const id = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{4,100}$/.test(id)) throw new Error("Enter a valid Golden Goose campaign ID.");
  return id;
}

function normalizePrize(id: string, value: any): SpecialPrize {
  return {
    id,
    title: String(value?.title || "").trim(),
    description: String(value?.description || "").trim(),
    campaignId: String(value?.campaignId || "").trim(),
    currency: /^[A-Z]{3}$/.test(String(value?.currency || "")) ? String(value.currency) : "USD",
    status: value?.status === "active" ? "active" : "paused",
    clicks: Math.max(0, Number(value?.clicks || 0)),
    createdAt: String(value?.createdAt || ""),
    updatedAt: String(value?.updatedAt || ""),
  };
}

export function getGoldenGooseScriptUrl(campaignId: string) {
  return `https://ngglznw.com/bc/${encodeURIComponent(cleanCampaignId(campaignId))}.js?force_https=1`;
}

export async function listSpecialPrizes(includePaused = false): Promise<SpecialPrize[]> {
  const raw = await queryRtdb(prizesPath) as Record<string, unknown> | null;
  return Object.entries(raw || {})
    .map(([id, value]) => normalizePrize(id, value))
    .filter((prize) => prize.id && prize.title && prize.campaignId)
    .filter((prize) => includePaused || prize.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveSpecialPrize(input: {
  id?: string;
  title: string;
  description?: string;
  campaignId: string;
  currency?: string;
  status?: "active" | "paused";
}) {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  if (title.length < 2 || title.length > 100) throw new Error("Title must be between 2 and 100 characters.");
  if (description.length > 500) throw new Error("Description must be 500 characters or fewer.");
  const campaignId = cleanCampaignId(input.campaignId);
  const currency = String(input.currency || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Choose a valid 3-letter offer currency.");
  const id = input.id ? String(input.id).trim() : crypto.randomUUID();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid prize ID.");
  const existing = await queryRtdb(`${prizesPath}/${id}`) as any;
  const now = new Date().toISOString();
  const prize: SpecialPrize = {
    id, title, description, campaignId, currency,
    status: input.status === "paused" ? "paused" : "active",
    clicks: Math.max(0, Number(existing?.clicks || 0)),
    createdAt: String(existing?.createdAt || now),
    updatedAt: now,
  };
  await queryRtdb(`${prizesPath}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prize),
  });
  return prize;
}

export async function setSpecialPrizeStatus(id: string, status: "active" | "paused") {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid prize ID.");
  const existing = await queryRtdb(`${prizesPath}/${id}`) as any;
  if (!existing) throw new Error("Special prize was not found.");
  const updated = { ...existing, id, status, updatedAt: new Date().toISOString() };
  await queryRtdb(`${prizesPath}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  return normalizePrize(id, updated);
}

export async function recordSpecialPrizeClick(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid prize ID.");
  const existing = await queryRtdb(`${prizesPath}/${id}`) as any;
  if (!existing || existing.status !== "active") throw new Error("This special prize is no longer available.");
  const updated = { ...existing, clicks: Math.max(0, Number(existing.clicks || 0) + 1), updatedAt: new Date().toISOString() };
  await queryRtdb(`${prizesPath}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  return { id, clicks: updated.clicks };
}


const conversionPath = (eventId: string) => `commerce/specialPrizeConversions/${crypto.createHash("sha256").update(eventId).digest("hex")}`;

export async function recordGoldenGoosePostback(request: Request, url: URL) {
  const configuredSecret = process.env.GOLDENGOOSE_POSTBACK_SECRET?.trim();
  if (!configuredSecret) return { ok: false as const, status: 503, error: "Golden Goose postback secret is not configured." };
  const suppliedSecret = url.searchParams.get("key") || request.headers.get("x-goldengoose-secret") || "";
  if (suppliedSecret !== configuredSecret) return { ok: false as const, status: 401, error: "Invalid postback key." };

  let params = new URLSearchParams(url.searchParams);
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      for (const [key, value] of Object.entries(body)) if (value != null) params.set(key, String(value));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = new URLSearchParams(await request.text());
      body.forEach((value, key) => params.set(key, value));
    }
  }

  const eventId = String(params.get("event_id") || "").trim();
  const event = String(params.get("event") || "").trim().toLowerCase();
  const token = String(params.get("p1") || "").trim();
  const prizeId = String(params.get("p2") || "").trim();
  const profitText = String(params.get("profit") || "").trim();
  const profit = Number(profitText);
  if (!eventId || eventId.length > 200 || !/^[A-Za-z0-9_-]{10,40}$/.test(token) || !/^[A-Za-z0-9_-]{1,100}$/.test(prizeId) || !Number.isFinite(profit) || profit < 0) {
    return { ok: false as const, status: 400, error: "Postback is missing a valid event_id, p1, p2 or profit." };
  }

  const promotion = await queryRtdb(`commerce/promotionLinks/${token}`) as any;
  if (!promotion || promotion.service !== "special-prize" || promotion.specialPrizeId !== prizeId || !promotion.creatorId) {
    return { ok: false as const, status: 400, error: "Promotion attribution could not be verified." };
  }
  const eventPath = conversionPath(eventId);
  const previous = await queryRtdb(eventPath) as any;
  if (previous) return { ok: true as const, status: 200, duplicate: true, eventId };

  const payableEvents = new Set(["subs", "redeem", "iclick", "rebill", "hold-aproved"]);
  const pendingEvents = new Set(["hold"]);
  const knownEvents = new Set([...payableEvents, ...pendingEvents, "unsubs", "hold-canceled"]);
  if (!knownEvents.has(event)) return { ok: false as const, status: 400, error: "Unsupported Golden Goose event." };
  const prizeRaw = await queryRtdb(`${prizesPath}/${prizeId}`) as any;
  const currency = /^[A-Z]{3}$/.test(String(prizeRaw?.currency || "")) ? String(prizeRaw.currency) : "USD";
  const commission = (payableEvents.has(event) || pendingEvents.has(event)) ? Math.round(profit * 0.35 * 10000) / 10000 : 0;
  const now = new Date().toISOString();
  const conversion = {
    id: eventId,
    eventId,
    event,
    token,
    creatorId: String(promotion.creatorId),
    prizeId,
    prizeTitle: String(promotion.label || prizeRaw?.title || "Special Prize"),
    profit,
    currency,
    creatorSharePercent: 35,
    creatorCommission: commission,
    status: payableEvents.has(event) ? "approved" : pendingEvents.has(event) ? "pending" : "non_payable",
    settlementStatus: payableEvents.has(event) ? "pending" : "not_payable",
    receivedAt: now,
  };
  await queryRtdb(eventPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conversion) });
  return { ok: true as const, status: 200, duplicate: false, eventId, event, creatorCommission: commission, currency, statusLabel: conversion.status };
}

export async function getCreatorSpecialPrizeEarnings(creatorId: string) {
  const raw = await queryRtdb("commerce/specialPrizeConversions") as Record<string, any> | null;
  const totals = new Map<string, { currency: string; confirmedCommission: number; pendingCommission: number; approvedEvents: number; pendingEvents: number }>();
  for (const item of Object.values(raw || {})) {
    if (item?.creatorId !== creatorId) continue;
    const currency = /^[A-Z]{3}$/.test(String(item.currency || "")) ? String(item.currency) : "USD";
    const current = totals.get(currency) || { currency, confirmedCommission: 0, pendingCommission: 0, approvedEvents: 0, pendingEvents: 0 };
    if (item.status === "approved") { current.confirmedCommission += Number(item.creatorCommission || 0); current.approvedEvents += 1; }
    if (item.status === "pending") { current.pendingCommission += Number(item.creatorCommission || 0); current.pendingEvents += 1; }
    totals.set(currency, current);
  }
  return [...totals.values()].map((item) => ({
    ...item,
    confirmedCommission: Math.round(item.confirmedCommission * 10000) / 10000,
    pendingCommission: Math.round(item.pendingCommission * 10000) / 10000,
  }));
}
