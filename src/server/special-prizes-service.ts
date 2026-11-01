import crypto from "node:crypto";
import { queryRtdb } from "./xseries-service-account";

export type SpecialPrize = {
  id: string;
  title: string;
  description: string;
  details: string;
  steps: string[];
  smsInstructions: string;
  screenshots: string[];
  campaignId: string;
  imageUrl: string;
  scriptSnippet: string;
  currency: string;
  status: "active" | "paused";
  clicks: number;
  createdAt: string;
  updatedAt: string;
};

const prizesPath = "commerce/specialPrizes";

const bannerPath = "commerce/specialPrizesSettings/banner";

export type SpecialPrizesBanner = {
  enabled: boolean;
  imageUrl: string;
  title: string;
  subtitle: string;
  updatedAt: string;
};

const defaultBanner: SpecialPrizesBanner = {
  enabled: false,
  imageUrl: "",
  title: "Special Prizes",
  subtitle: "Explore special offers selected for XoraTV.",
  updatedAt: "",
};

export async function getSpecialPrizesBanner(): Promise<SpecialPrizesBanner> {
  const raw = await queryRtdb(bannerPath) as Partial<SpecialPrizesBanner> | null;
  return {
    enabled: raw?.enabled === true,
    imageUrl: String(raw?.imageUrl || "").trim(),
    title: String(raw?.title || defaultBanner.title).trim().slice(0, 100),
    subtitle: String(raw?.subtitle || defaultBanner.subtitle).trim().slice(0, 300),
    updatedAt: String(raw?.updatedAt || ""),
  };
}

export async function saveSpecialPrizesBanner(input: {
  enabled?: boolean;
  imageUrl?: string;
  title?: string;
  subtitle?: string;
}): Promise<SpecialPrizesBanner> {
  const rawImageUrl = String(input.imageUrl || "").trim();
  let imageUrl = "";
  if (rawImageUrl) {
    try {
      const parsed = new URL(rawImageUrl);
      if (parsed.protocol !== "https:") throw new Error();
      imageUrl = parsed.toString();
    } catch {
      throw new Error("Banner image must be a valid HTTPS URL.");
    }
  }
  const title = String(input.title || defaultBanner.title).trim();
  const subtitle = String(input.subtitle || defaultBanner.subtitle).trim();
  if (!title || title.length > 100) throw new Error("Banner title must be between 1 and 100 characters.");
  if (subtitle.length > 300) throw new Error("Banner text must be 300 characters or fewer.");
  const banner: SpecialPrizesBanner = {
    enabled: input.enabled === true && Boolean(imageUrl),
    imageUrl,
    title,
    subtitle,
    updatedAt: new Date().toISOString(),
  };
  await queryRtdb(bannerPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(banner),
  });
  return banner;
}

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
    details: String(value?.details || "").trim(),
    steps: Array.isArray(value?.steps) ? value.steps.map((step: unknown) => String(step || "").trim()).filter(Boolean).slice(0, 20) : [],
    smsInstructions: String(value?.smsInstructions || "").trim(),
    screenshots: Array.isArray(value?.screenshots) ? value.screenshots.map((url: unknown) => String(url || "").trim()).filter((url: string) => /^https:\/\//i.test(url)).slice(0, 12) : [],
    campaignId: String(value?.campaignId || "").trim(),
    imageUrl: String(value?.imageUrl || "").trim(),
    scriptSnippet: String(value?.scriptSnippet || ""),
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
    .filter((prize) => prize.id && prize.title && (prize.campaignId || prize.scriptSnippet))
    .filter((prize) => includePaused || prize.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveSpecialPrize(input: {
  id?: string;
  title: string;
  description?: string;
  details?: string;
  steps?: string[];
  smsInstructions?: string;
  screenshots?: string[];
  campaignId?: string;
  imageUrl?: string;
  scriptSnippet?: string;
  currency?: string;
  status?: "active" | "paused";
}) {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  if (title.length < 2 || title.length > 100) throw new Error("Title must be between 2 and 100 characters.");
  if (description.length > 500) throw new Error("Short description must be 500 characters or fewer.");
  const details = String(input.details || "").trim();
  if (details.length > 5000) throw new Error("Offer details must be 5,000 characters or fewer.");
  const steps = Array.isArray(input.steps) ? input.steps.map((step) => String(step || "").trim()).filter(Boolean).slice(0, 20) : [];
  if (steps.some((step) => step.length > 500)) throw new Error("Each offer step must be 500 characters or fewer.");
  const smsInstructions = String(input.smsInstructions || "").trim();
  if (smsInstructions.length > 2000) throw new Error("SMS instructions must be 2,000 characters or fewer.");
  const screenshots = Array.isArray(input.screenshots) ? input.screenshots.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 12) : [];
  for (const screenshot of screenshots) {
    try { const parsed = new URL(screenshot); if (parsed.protocol !== "https:") throw new Error(); }
    catch { throw new Error("Every offer-flow screenshot must be a valid HTTPS URL."); }
  }
  const scriptSnippet = String(input.scriptSnippet || "");
  if (scriptSnippet.length > 20000) throw new Error("Offer script must be 20,000 characters or fewer.");
  const rawCampaignId = String(input.campaignId || "").trim();
  const campaignId = rawCampaignId ? cleanCampaignId(rawCampaignId) : "";
  if (!campaignId && !scriptSnippet.trim()) throw new Error("Provide a Golden Goose campaign ID or paste the offer script.");
  const rawImageUrl = String(input.imageUrl || "").trim();
  let imageUrl = "";
  if (rawImageUrl) {
    try {
      const parsed = new URL(rawImageUrl);
      if (parsed.protocol !== "https:") throw new Error();
      imageUrl = parsed.toString();
    } catch {
      throw new Error("Offer image must be a valid HTTPS URL.");
    }
  }
  const currency = String(input.currency || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Choose a valid 3-letter offer currency.");
  const id = input.id ? String(input.id).trim() : crypto.randomUUID();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid prize ID.");
  const existing = await queryRtdb(`${prizesPath}/${id}`) as any;
  const now = new Date().toISOString();
  const prize: SpecialPrize = {
    id, title, description, details, steps, smsInstructions, screenshots, campaignId, imageUrl, scriptSnippet, currency,
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

export async function deleteSpecialPrize(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid prize ID.");
  const existing = await queryRtdb(`${prizesPath}/${id}`) as any;
  if (!existing) throw new Error("Special prize was not found.");
  await queryRtdb(`${prizesPath}/${id}`, { method: "DELETE" });
  return { id, deleted: true };
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



export type SpecialPrizeTrafficRecord = {
  id: string;
  token: string;
  creatorId: string;
  creatorUsername: string;
  creatorDisplayName: string;
  prizeId: string;
  prizeTitle: string;
  postId: string | null;
  source: string;
  sourceType: "social" | "search" | "website" | "internal" | "direct" | "unknown";
  medium: string | null;
  campaign: string | null;
  referrerHost: string | null;
  browserName: string;
  clickedAt: string;
};

function safeTrafficValue(value: string | null, max = 120): string | null {
  const clean = String(value || "").trim().replace(/[<>\r\n]/g, "").slice(0, max);
  return clean || null;
}

function classifyTrafficSource(source: string, referrerHost: string | null): SpecialPrizeTrafficRecord["sourceType"] {
  const value = (source || referrerHost || "").toLowerCase();
  if (!value) return "direct";
  if (/(facebook|instagram|tiktok|youtube|x\.com|twitter|whatsapp|telegram|reddit|pinterest|snapchat)/.test(value)) return "social";
  if (/(google|bing|yahoo|duckduckgo|baidu)/.test(value)) return "search";
  if (value.includes("xoratv")) return "internal";
  if (referrerHost || value.includes(".")) return "website";
  return "unknown";
}

function detectTrafficBrowser(userAgent: string): string {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return "Unknown";
  if (/opera mini|opmini|opera mobi/.test(ua)) return "Opera Mini";
  if (/edg\//.test(ua)) return "Microsoft Edge";
  if (/samsungbrowser/.test(ua)) return "Samsung Internet";
  if (/opr\//.test(ua)) return "Opera";
  if (/fbav|fban|fb_iab/.test(ua)) return "Facebook In-App";
  if (/instagram/.test(ua)) return "Instagram In-App";
  if (/bytedancewebview|tiktok/.test(ua)) return "TikTok In-App";
  if (/; wv\)|\bwv\b/.test(ua)) return "Android WebView";
  if (/firefox|fxios/.test(ua)) return "Firefox";
  if (/chrome|crios/.test(ua)) return "Chrome";
  if (/safari/.test(ua)) return "Safari";
  return "Other browser";
}

/** Resolve and record an attributed Special Prize link visit without storing raw IPs or full referrer URLs. */
export async function resolveSpecialPrizePromotionClick(token: string, request: Request, url: URL) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  const promotion = await queryRtdb(`commerce/promotionLinks/${token}`) as any;
  if (!promotion || promotion.service !== "special-prize" || !promotion.creatorId || !promotion.specialPrizeId) return null;

  const prize = await queryRtdb(`${prizesPath}/${promotion.specialPrizeId}`) as any;
  if (!prize || prize.status !== "active") return null;

  const creator = await queryRtdb(`commerce/creators/${promotion.creatorId}`) as any;
  const referer = request.headers.get("referer") || "";
  const browserName = detectTrafficBrowser(request.headers.get("user-agent") || "");
  let referrerHost: string | null = null;
  try { referrerHost = referer ? new URL(referer).hostname.toLowerCase().slice(0, 180) : null; } catch { referrerHost = null; }
  const utmSource = safeTrafficValue(url.searchParams.get("utm_source"));
  const medium = safeTrafficValue(url.searchParams.get("utm_medium"));
  const campaign = safeTrafficValue(url.searchParams.get("utm_campaign"));
  const source = utmSource || referrerHost || "Direct / unknown";
  const postIdRaw = safeTrafficValue(url.searchParams.get("postId"), 100);
  const postId = postIdRaw && /^[A-Za-z0-9_-]{1,100}$/.test(postIdRaw) ? postIdRaw : null;
  const clickedAt = new Date().toISOString();
  const record: SpecialPrizeTrafficRecord = {
    id: crypto.randomUUID(),
    token,
    creatorId: String(promotion.creatorId),
    creatorUsername: String(creator?.username || ""),
    creatorDisplayName: String(creator?.displayName || "Xora Creator"),
    prizeId: String(promotion.specialPrizeId),
    prizeTitle: String(prize.title || promotion.label || "Special Prize"),
    postId,
    source: source.slice(0, 180),
    sourceType: classifyTrafficSource(source, referrerHost),
    medium,
    campaign,
    referrerHost,
    browserName,
    clickedAt,
  };
  await queryRtdb(`commerce/specialPrizeTraffic/${record.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  await queryRtdb(`commerce/promotionLinks/${token}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clicks: Math.max(0, Number(promotion.clicks || 0) + 1), updatedAt: clickedAt }),
  });

  const target = new URL("/special-prizes", url.origin);
  target.searchParams.set("offer", String(promotion.specialPrizeId));
  target.searchParams.set("promo", token);
  target.searchParams.set("click", record.id);
  if (postId) target.searchParams.set("postId", postId);
  return { promotion, targetPath: target.pathname + target.search };
}


type GoldenGooseTestRecord = {
  id: string;
  prizeId: string;
  prizeTitle: string;
  campaignId: string;
  p1: string;
  p2: string;
  scriptUrl: string;
  status: "waiting" | "received";
  createdAt: string;
  receivedAt?: string;
  eventId?: string;
  event?: string;
  profit?: number;
};

const goldenGooseTestsPath = "commerce/goldenGooseTests";

function getPrizeProviderScriptUrl(snippet: string): string {
  const value = String(snippet || "").trim();
  if (!value) throw new Error("Paste the Golden Goose campaign script snippet first.");

  // Accept a complete script tag or a bare script URL copied from the provider.
  const tagMatch = value.match(/<script\\b[^>]*\\bsrc\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))[^>]*>/i);
  const rawUrl = (tagMatch?.[1] || tagMatch?.[2] || tagMatch?.[3] || value.match(/https?:\\/\\/[^\\s"'<>]+/i)?.[0] || value.match(/\\/\\/ngglznw\\.com\\/[^\\s"'<>]+/i)?.[0] || "").trim();
  if (!rawUrl) throw new Error("The pasted snippet must contain a Golden Goose script URL.");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl);
  } catch {
    throw new Error("The script URL in the pasted snippet is not valid.");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "ngglznw.com" || !parsed.pathname.startsWith("/bc/") || parsed.pathname.length <= 4) {
    throw new Error("Paste the Golden Goose campaign script tag or URL from ngglznw.com under /bc/.");
  }
  parsed.searchParams.set("force_https", "1");
  return parsed.toString();
}

export async function createGoldenGooseTest(prizeId: string, origin: string, pastedSnippet: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(prizeId)) throw new Error("Invalid Special Prize ID.");
  const prizeRaw = await queryRtdb(`${prizesPath}/${prizeId}`) as any;
  if (!prizeRaw || prizeRaw.status !== "active") throw new Error("Choose an active Special Prize campaign.");
  const prize = normalizePrize(prizeId, prizeRaw);
  const scriptUrl = getPrizeProviderScriptUrl(prize);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: GoldenGooseTestRecord = {
    id, prizeId, prizeTitle: prize.title, campaignId: prize.campaignId || "custom-script",
    p1: id, p2: prizeId, scriptUrl, status: "waiting", createdAt: now,
  };
  await queryRtdb(`${goldenGooseTestsPath}/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record),
  });
  return { testId: id, testUrl: `${origin.replace(/\/$/, "")}/goldengoose/test/${id}`, status: record.status, prizeTitle: prize.title };
}

export async function getGoldenGooseTest(testId: string) {
  if (!/^[A-Za-z0-9_-]{36}$/.test(testId)) throw new Error("Invalid test ID.");
  const record = await queryRtdb(`${goldenGooseTestsPath}/${testId}`) as GoldenGooseTestRecord | null;
  if (!record || record.id !== testId) throw new Error("Golden Goose test was not found.");
  return record;
}

export async function renderGoldenGooseTestPage(testId: string): Promise<Response> {
  const record = await getGoldenGooseTest(testId);
  const scriptUrl = new URL(record.scriptUrl);
  scriptUrl.searchParams.set("p1", record.p1);
  scriptUrl.searchParams.set("p2", record.p2);
  const safeScriptUrl = scriptUrl.toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XoraTV Golden Goose test</title><style>body{font:16px system-ui,sans-serif;background:#100f18;color:#f7f3ff;margin:0;padding:32px 18px}.card{max-width:620px;margin:8vh auto;padding:28px;border:1px solid #51476a;border-radius:22px;background:#1d1a29}small{color:#c8bddc}code{overflow-wrap:anywhere}</style></head><body><main class="card"><h1>XoraTV · Golden Goose test</h1><p>Test campaign: <strong>${escapeHtml(record.prizeTitle)}</strong></p><p><small>This isolated test click uses p1 and p2 values reserved for postback testing. It does not create creator earnings or wallet credits.</small></p><p>Attribution ID: <code>${record.p1}</code></p><div id="golden-goose-campaign">Loading campaign script…</div></main><script src="${safeScriptUrl}" async></script></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export async function listSpecialPrizeTraffic(limit = 250): Promise<SpecialPrizeTrafficRecord[]> {
  const raw = await queryRtdb("commerce/specialPrizeTraffic") as Record<string, SpecialPrizeTrafficRecord> | SpecialPrizeTrafficRecord[] | null;
  const records = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : [];
  return records.filter((item) => item && item.id && item.creatorId && item.prizeId)
    .sort((a, b) => String(b.clickedAt || "").localeCompare(String(a.clickedAt || "")))
    .slice(0, Math.max(1, Math.min(500, Math.floor(limit))));
}

const conversionPath = (eventId: string) => `commerce/specialPrizeConversions/${crypto.createHash("sha256").update(eventId).digest("hex")}`;

export async function recordGoldenGoosePostback(request: Request, url: URL) {
  // Golden Goose does not provide a shared postback secret. Validate every event
  // against XoraTV's recorded click/promotion and prize attribution below.
  const params = new URLSearchParams(url.searchParams);
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      for (const [key, value] of Object.entries(body)) if (value != null) params.set(key, String(value));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      new URLSearchParams(await request.text()).forEach((value, key) => params.set(key, value));
    }
  }

  const eventId = String(params.get("event_id") || "").trim();
  const event = String(params.get("event") || "").trim().toLowerCase();
  const attributionKey = String(params.get("p1") || "").trim();
  const prizeId = String(params.get("p2") || "").trim();
  const profit = Number(String(params.get("profit") || "").trim());
  const approvedEvents = new Set(["subs", "redeem", "iclick", "rebill"]);
  const pendingEvents = new Set(["hold"]);
  const holdApprovedEvents = new Set(["hold-aproved", "hold-approved"]);
  const holdCancelledEvents = new Set(["hold-canceled", "hold-cancelled"]);
  const knownEvents = new Set([...approvedEvents, ...pendingEvents, ...holdApprovedEvents, ...holdCancelledEvents, "unsubs"]);
  if (!eventId || eventId.length > 200 || !/^[A-Za-z0-9_-]{10,40}$/.test(attributionKey) || !/^[A-Za-z0-9_-]{1,100}$/.test(prizeId) || !Number.isFinite(profit) || profit < 0) {
    return { ok: false as const, status: 400, error: "Postback is missing a valid event_id, p1, p2 or profit." };
  }

  // Test clicks are isolated from creator attribution and all earnings calculations.
  const testRecord = await queryRtdb(`${goldenGooseTestsPath}/${attributionKey}`) as GoldenGooseTestRecord | null;
  if (testRecord?.id === attributionKey && testRecord.p1 === attributionKey && testRecord.p2 === prizeId) {
    if (!/^[a-z0-9_-]{1,80}$/.test(event)) return { ok: false as const, status: 400, error: "Invalid test event." };
    const eventPath = conversionPath(eventId);
    const previous = await queryRtdb(eventPath) as any;
    if (previous) return { ok: true as const, status: 200, duplicate: true, test: true, eventId };
    const receivedAt = new Date().toISOString();
    await queryRtdb(`${goldenGooseTestsPath}/${attributionKey}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "received", receivedAt, eventId, event, profit }),
    });
    await queryRtdb(eventPath, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: eventId, eventId, event, attributionKey, prizeId, profit, status: "test_received", creatorCommission: 0, settlementStatus: "not_payable", test: true, receivedAt }),
    });
    return { ok: true as const, status: 200, duplicate: false, test: true, eventId, event, profit, creatorCommission: 0, statusLabel: "test_received" };
  }

  if (!knownEvents.has(event)) return { ok: false as const, status: 400, error: "Unsupported Golden Goose event." };

  const eventPath = conversionPath(eventId);
  const previous = await queryRtdb(eventPath) as any;
  if (previous) return { ok: true as const, status: 200, duplicate: true, eventId };

  let traffic: any = null;
  let promotion: any = null;
  if (/^[A-Za-z0-9_-]{36}$/.test(attributionKey)) {
    traffic = await queryRtdb(`commerce/specialPrizeTraffic/${attributionKey}`) as any;
    if (traffic?.id !== attributionKey || traffic?.prizeId !== prizeId) traffic = null;
  }
  if (!traffic) {
    promotion = await queryRtdb(`commerce/promotionLinks/${attributionKey}`) as any;
    if (!promotion || promotion.service !== "special-prize" || promotion.specialPrizeId !== prizeId || !promotion.creatorId) {
      return { ok: false as const, status: 400, error: "Promotion attribution could not be verified." };
    }
  }
  const creatorId = String(traffic?.creatorId || promotion?.creatorId || "");
  if (!creatorId) return { ok: false as const, status: 400, error: "Creator attribution could not be verified." };
  const prizeRaw = await queryRtdb(`${prizesPath}/${prizeId}`) as any;
  const currency = /^[A-Z]{3}$/.test(String(prizeRaw?.currency || "")) ? String(prizeRaw.currency) : "USD";
  const now = new Date().toISOString();

  if (holdApprovedEvents.has(event) || holdCancelledEvents.has(event)) {
    const all = await queryRtdb("commerce/specialPrizeConversions") as Record<string, any> | null;
    const matches = Object.entries(all || {}).filter(([, item]) =>
      item?.creatorId === creatorId && item?.prizeId === prizeId &&
      (item?.attributionKey === attributionKey || (!item?.attributionKey && item?.token === attributionKey)) &&
      item?.event === "hold" && item?.status === "pending"
    );
    if (matches.length !== 1) return {
      ok: false as const, status: 409,
      error: matches.length === 0
        ? "No matching pending hold was found for this click; no status change was made."
        : "Multiple pending holds match this click; no status change was made to prevent incorrect attribution.",
    };
    const [recordKey, pending] = matches[0];
    const nextStatus = holdApprovedEvents.has(event) ? "approved" : "cancelled";
    await queryRtdb(`commerce/specialPrizeConversions/${recordKey}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: nextStatus,
        settlementStatus: nextStatus === "approved" ? "pending" : "not_payable",
        profit: nextStatus === "approved" ? profit : Number(pending.profit || 0),
        currency,
        creatorCommission: nextStatus === "approved" ? Math.round(profit * 0.35 * 10000) / 10000 : 0,
        statusUpdatedAt: now,
        statusEventId: eventId,
      }),
    });
    await queryRtdb(eventPath, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: eventId, eventId, event, attributionKey, creatorId, prizeId,
        token: String(pending.token || attributionKey), profit, currency,
        creatorSharePercent: 35, creatorCommission: 0, status: "status_update",
        settlementStatus: "not_payable", updatesEventId: String(pending.eventId || pending.id || ""), receivedAt: now,
      }),
    });
    return { ok: true as const, status: 200, duplicate: false, eventId, event, statusLabel: nextStatus, creatorCommission: 0, currency };
  }

  const isApproved = approvedEvents.has(event);
  const isPending = pendingEvents.has(event);
  const commission = isApproved || isPending ? Math.round(profit * 0.35 * 10000) / 10000 : 0;
  const conversion = {
    id: eventId, eventId, event, attributionKey,
    token: String(traffic?.token || attributionKey), creatorId, prizeId,
    prizeTitle: String(traffic?.prizeTitle || promotion?.label || prizeRaw?.title || "Special Prize"),
    profit, currency, creatorSharePercent: 35, creatorCommission: commission,
    status: isApproved ? "approved" : isPending ? "pending" : "non_payable",
    settlementStatus: isApproved ? "pending" : "not_payable", receivedAt: now,
  };
  await queryRtdb(eventPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conversion) });
  return { ok: true as const, status: 200, duplicate: false, eventId, event, creatorCommission: commission, currency, statusLabel: conversion.status };
}

export async function getCreatorSpecialPrizeEarnings(creatorId: string) {
  const raw=await queryRtdb("commerce/specialPrizeConversions") as Record<string,any>|null;
  const totals=new Map<string,{currency:string;confirmedCommission:number;pendingCommission:number;approvedEvents:number;pendingEvents:number}>();
  for(const item of Object.values(raw||{})){
    if(item?.creatorId!==creatorId) continue;
    const currency=/^[A-Z]{3}$/.test(String(item.currency||""))?String(item.currency):"USD";
    const row=totals.get(currency)||{currency,confirmedCommission:0,pendingCommission:0,approvedEvents:0,pendingEvents:0};
    if(item.status==="approved"){row.confirmedCommission+=Number(item.creatorCommission||0);row.approvedEvents++;}
    if(item.status==="pending"){row.pendingCommission+=Number(item.creatorCommission||0);row.pendingEvents++;}
    totals.set(currency,row);
  }
  return [...totals.values()].map(v=>({...v,confirmedCommission:Math.round(v.confirmedCommission*10000)/10000,pendingCommission:Math.round(v.pendingCommission*10000)/10000}));
}

export async function getCreatorSpecialPrizeAnalytics(creatorId: string) {
  const [trafficRaw, conversionsRaw] = await Promise.all([
    queryRtdb("commerce/specialPrizeTraffic") as Promise<Record<string, any> | null>,
    queryRtdb("commerce/specialPrizeConversions") as Promise<Record<string, any> | null>,
  ]);
  const clicks = Object.values(trafficRaw || {})
    .filter((item: any) => item && item.creatorId === creatorId && item.id && item.clickedAt)
    .sort((a: any, b: any) => String(b.clickedAt).localeCompare(String(a.clickedAt)));
  const now = Date.now();
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const monthStart = now - 30 * 24 * 60 * 60 * 1000;
  const timestamp = (item: any) => {
    const parsed = Date.parse(String(item.clickedAt || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const sourceCounts = new Map<string, number>();
  const browserCounts = new Map<string, number>();
  const offerCounts = new Map<string, { prizeId: string; prizeTitle: string; clicks: number }>();
  for (const click of clicks) {
    const source = String((click as any).sourceType || "unknown");
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    const browser = String((click as any).browserName || "Unknown");
    browserCounts.set(browser, (browserCounts.get(browser) || 0) + 1);
    const prizeId = String((click as any).prizeId || "");
    const current = offerCounts.get(prizeId) || { prizeId, prizeTitle: String((click as any).prizeTitle || "Special Prize"), clicks: 0 };
    current.clicks++;
    offerCounts.set(prizeId, current);
  }
  const conversions = Object.values(conversionsRaw || {}).filter((item: any) => item && item.creatorId === creatorId);
  return {
    totalClicks: clicks.length,
    clicksToday: clicks.filter((item: any) => timestamp(item) >= todayStart.getTime()).length,
    clicksLast7Days: clicks.filter((item: any) => timestamp(item) >= weekStart).length,
    clicksLast30Days: clicks.filter((item: any) => timestamp(item) >= monthStart).length,
    sourceBreakdown: [...sourceCounts.entries()].map(([source, count]) => ({ source, clicks: count })).sort((a, b) => b.clicks - a.clicks),
    browserBreakdown: [...browserCounts.entries()].map(([browser, count]) => ({ browser, clicks: count })).sort((a, b) => b.clicks - a.clicks),
    offerBreakdown: [...offerCounts.values()].sort((a, b) => b.clicks - a.clicks),
    recentClicks: clicks.slice(0, 12),
    pendingConversions: conversions.filter((item: any) => item.status === "pending").length,
    approvedConversions: conversions.filter((item: any) => item.status === "approved").length,
    cancelledConversions: conversions.filter((item: any) => item.status === "cancelled").length,
  };
}
