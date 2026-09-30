import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { queryRtdb } from "./xseries-service-account";

const DEFAULT_POINTS_PER_USD = 100;
const CREATOR_SHARE_PERCENT = 35;
const MIN_CREATOR_CONVERSIONS = 200;
const ATTRIBUTION_DAYS = 30;

export type CpaOffer = {
  id: string;
  title: string;
  description: string;
  payout: number;
  points: number;
  imageUrl: string | null;
  offerUrl: string;
  offerType: string | null;
  raw: Record<string, unknown>;
};

export type CpaUserAccount = {
  userId: string;
  trackingId: string;
  points: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  updatedAt: string;
};

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
}

function pointsPerUsd() {
  const configured = Number(process.env.XORA_CPA_POINTS_PER_USD || DEFAULT_POINTS_PER_USD);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_POINTS_PER_USD;
}

function cpaUserPath(userId: string) { return `commerce/cpaUsers/${userId}`; }
function trackingPath(trackingId: string) { return `commerce/cpaTracking/${trackingId}`; }
function conversionPath(conversionId: string) { return `commerce/cpaConversions/${conversionId}`; }
function creatorStatsPath(creatorId: string) { return `commerce/cpaCreatorStats/${creatorId}`; }
function offerPromotionPath(token: string) { return `commerce/promotionLinks/${token}`; }

function normalizeXmlText(value: unknown) {
  return String(value ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
}

function field(node: cheerio.Cheerio<cheerio.Element>, names: string[]) {
  for (const name of names) {
    const value = node.find(name).first().text();
    if (value.trim()) return normalizeXmlText(value);
  }
  return "";
}

function createTrackingId(userId: string) {
  return `xora_${crypto.createHash("sha256").update(userId).digest("hex").slice(0, 28)}`;
}

async function getOrCreateCpaUser(userId: string): Promise<CpaUserAccount> {
  const existing = (await queryRtdb(cpaUserPath(userId))) as CpaUserAccount | null;
  if (existing?.trackingId) return existing;
  const now = new Date().toISOString();
  const record: CpaUserAccount = {
    userId,
    trackingId: createTrackingId(userId),
    points: Number(existing?.points || 0),
    lifetimeEarned: Number(existing?.lifetimeEarned || 0),
    lifetimeRedeemed: Number(existing?.lifetimeRedeemed || 0),
    updatedAt: now,
  };
  await queryRtdb(cpaUserPath(userId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
  await queryRtdb(trackingPath(record.trackingId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, trackingId: record.trackingId, updatedAt: now }) });
  return record;
}

async function setCreatorAttribution(trackingId: string, creatorId: string, promotionToken: string) {
  const now = Date.now();
  await queryRtdb(trackingPath(trackingId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creatorId,
      promotionToken,
      attributedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ATTRIBUTION_DAYS * 86400000).toISOString(),
    }),
  });
}

async function getTrackingRecord(trackingId: string) {
  return (await queryRtdb(trackingPath(trackingId))) as {
    userId?: string;
    creatorId?: string | null;
    promotionToken?: string | null;
    expiresAt?: string | null;
  } | null;
}

function getFeedKey() {
  const userId = process.env.CPAGRIP_USER_ID?.trim();
  const key = process.env.CPAGRIP_RSS_KEY?.trim();
  if (!userId || !key) throw new Error("CPAGRIP_USER_ID and CPAGRIP_RSS_KEY are not configured on the server.");
  return { userId, key };
}

export async function getCpaOffers(params: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
  promotionToken?: string | null;
  offerId?: string | null;
  limit?: number;
}) {
  const { userId: cpagripUserId, key } = getFeedKey();
  const account = await getOrCreateCpaUser(params.userId);

  const promo = String(params.promotionToken || "").trim();
  if (promo) {
    const link = (await queryRtdb(offerPromotionPath(promo))) as any;
    if (link?.service === "offer" && link.creatorId) {
      await setCreatorAttribution(account.trackingId, String(link.creatorId), promo);
    }
  }

  const feed = new URL("https://www.cpagrip.com/common/offer_feed_rss.php");
  feed.searchParams.set("user_id", cpagripUserId);
  feed.searchParams.set("key", key);
  feed.searchParams.set("tracking_id", account.trackingId);
  if (params.ip) feed.searchParams.set("ip", params.ip);
  if (params.userAgent) feed.searchParams.set("ua", params.userAgent);
  feed.searchParams.set("limit", String(Math.min(50, Math.max(1, Number(params.limit || 20)))));

  const response = await fetch(feed, { signal: AbortSignal.timeout(15000) });
  const xml = await response.text();
  if (!response.ok) throw new Error(`CPAGrip offer feed failed (HTTP ${response.status}).`);

  const $ = cheerio.load(xml, { xmlMode: true });
  const offers: CpaOffer[] = [];
  $("offer").each((_, element) => {
    const node = $(element);
    const idValue = field(node, ["offer_id", "offerid", "id"]);
    const title = field(node, ["title", "name"]) || "Eligible offer";
    const payout = Number(field(node, ["payout", "amount", "commission"]).replace(/[$,]/g, "")) || 0;
    const offerUrl = field(node, ["offerlink", "offer_link", "url", "link"]);
    if (!idValue || !offerUrl) return;
    const imageUrl = field(node, ["offerphoto", "offer_photo", "image", "image_url"]) || null;
    const description = field(node, ["description", "desc"]);
    const offerType = field(node, ["offer_type", "type"]) || null;
    const points = Math.max(1, Math.round(payout * pointsPerUsd()));
    offers.push({ id: idValue, title, description, payout, points, imageUrl, offerUrl, offerType, raw: { offerId: idValue, title, payout, offerUrl, imageUrl, description, offerType } });
  });

  const requestedOfferId = String(params.offerId || "").trim();
  return {
    trackingId: account.trackingId,
    points: account.points,
    offers: requestedOfferId ? offers.filter((offer) => offer.id === requestedOfferId) : offers,
    fetchedAt: new Date().toISOString(),
    pointsPerUsd: pointsPerUsd(),
  };
}

export async function recordCpaClick(params: {
  userId: string;
  trackingId: string;
  offerId: string;
  offerTitle?: string | null;
  promotionToken?: string | null;
}) {
  const account = await getOrCreateCpaUser(params.userId);
  if (account.trackingId !== params.trackingId) throw new Error("Invalid offer tracking session.");
  const tracking = await getTrackingRecord(params.trackingId);
  const clickId = id("cpa_click");
  const record = {
    id: clickId,
    userId: params.userId,
    trackingId: params.trackingId,
    offerId: String(params.offerId),
    offerTitle: String(params.offerTitle || ""),
    creatorId: tracking?.creatorId || null,
    promotionToken: tracking?.promotionToken || params.promotionToken || null,
    createdAt: new Date().toISOString(),
  };
  await queryRtdb(`commerce/cpaClicks/${clickId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
  return record;
}

export async function getCpaWallet(userId: string) {
  const account = await getOrCreateCpaUser(userId);
  return { points: account.points, lifetimeEarned: account.lifetimeEarned, lifetimeRedeemed: account.lifetimeRedeemed };
}

export async function handleCpaPostback(request: Request) {
  const configuredPassword = process.env.CPAGRIP_POSTBACK_PASSWORD?.trim();
  if (!configuredPassword) return { ok: false as const, status: 503, error: "CPAGRIP_POSTBACK_PASSWORD is not configured." };

  const contentType = request.headers.get("content-type") || "";
  let payload: Record<string, string> = {};
  if (contentType.includes("application/json")) {
    payload = (await request.json().catch(() => ({}))) as Record<string, string>;
  } else {
    payload = Object.fromEntries(new URLSearchParams(await request.text()).entries());
  }

  if (String(payload.password || "") !== configuredPassword) return { ok: false as const, status: 401, error: "Invalid CPAGrip postback password." };

  const payout = Number(String(payload.payout || "0").replace(/[$,]/g, ""));
  const offerId = String(payload.offer_id || "").trim();
  const trackingId = String(payload.tracking_id || "").trim();
  if (!offerId || !trackingId || !Number.isFinite(payout) || payout <= 0) {
    return { ok: false as const, status: 400, error: "Postback requires offer_id, tracking_id and a positive payout." };
  }

  const conversionId = crypto.createHash("sha256").update(`cpagrip|${offerId}|${trackingId}|${payout.toFixed(4)}`).digest("hex");
  if (await queryRtdb(conversionPath(conversionId))) return { ok: true as const, status: 200, duplicate: true, conversionId };

  const tracking = await getTrackingRecord(trackingId);
  const userId = String(tracking?.userId || "").trim();
  if (!userId) {
    await queryRtdb(conversionPath(conversionId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: conversionId, status: "unmatched", offerId, trackingId, payout, payload, receivedAt: new Date().toISOString() }) });
    return { ok: true as const, status: 200, conversionId, matched: false };
  }

  const points = Math.max(1, Math.round(payout * pointsPerUsd()));
  const creatorId = tracking?.expiresAt && new Date(tracking.expiresAt).getTime() > Date.now() ? tracking.creatorId || null : null;
  const creatorCommission = creatorId ? Math.round(payout * (CREATOR_SHARE_PERCENT / 100) * 10000) / 10000 : 0;
  const now = new Date().toISOString();

  const conversion = {
    id: conversionId,
    userId,
    trackingId,
    creatorId,
    promotionToken: tracking?.promotionToken || null,
    offerId,
    payout,
    points,
    creatorCommission,
    creatorSharePercent: CREATOR_SHARE_PERCENT,
    status: "approved",
    settlementStatus: "pending",
    receivedAt: now,
    settledAt: null,
    paidAt: null,
    payload,
  };

  await queryRtdb(conversionPath(conversionId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conversion) });

  const account = await getOrCreateCpaUser(userId);
  await queryRtdb(cpaUserPath(userId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...account, points: account.points + points, lifetimeEarned: account.lifetimeEarned + points, updatedAt: now }),
  });

  if (creatorId) {
    const current = (await queryRtdb(creatorStatsPath(creatorId))) as any || {};
    await queryRtdb(creatorStatsPath(creatorId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creatorId,
        approvedConversions: Number(current.approvedConversions || 0) + 1,
        pendingCommission: Number(current.pendingCommission || 0) + creatorCommission,
        payableCommission: Number(current.payableCommission || 0),
        paidCommission: Number(current.paidCommission || 0),
        minConversions: MIN_CREATOR_CONVERSIONS,
        updatedAt: now,
      }),
    });
  }

  return { ok: true as const, status: 200, duplicate: false, conversionId, userId, points, creatorId, creatorCommission };
}

export async function createOfferPromotionLink(params: { creatorId: string; offerId?: string | null; offerTitle?: string | null }) {
  const creator = (await queryRtdb(`commerce/creators/${params.creatorId}`)) as any;
  if (!creator || creator.status !== "active") throw new Error("Creator account is not active.");
  const token = crypto.randomBytes(9).toString("base64url");
  const now = new Date().toISOString();
  const record = {
    token,
    creatorId: params.creatorId,
    service: "offer",
    offerId: params.offerId ? String(params.offerId) : null,
    label: String(params.offerTitle || "Xora Offer Wall"),
    targetPath: "/offers" + (params.offerId ? `?offer=${encodeURIComponent(String(params.offerId))}` : ""),
    clicks: 0,
    createdAt: now,
    updatedAt: now,
  };
  await queryRtdb(offerPromotionPath(token), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
  return record;
}

export async function getCreatorCpaDashboard(creatorId: string) {
  const stats = (await queryRtdb(creatorStatsPath(creatorId))) as any || {};
  const raw = (await queryRtdb("commerce/cpaConversions")) as Record<string, any> | null;
  const conversions = Object.values(raw || {}).filter((item: any) => item?.creatorId === creatorId);
  return {
    approvedConversions: Number(stats.approvedConversions || 0),
    pendingCommission: Number(stats.pendingCommission || 0),
    payableCommission: Number(stats.payableCommission || 0),
    paidCommission: Number(stats.paidCommission || 0),
    minConversions: MIN_CREATOR_CONVERSIONS,
    payoutEligible: Number(stats.approvedConversions || 0) >= MIN_CREATOR_CONVERSIONS && Number(stats.payableCommission || 0) > 0,
    conversions: conversions.slice(-50).reverse(),
  };
}
