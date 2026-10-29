import crypto from "node:crypto";
import { queryRtdb } from "./xseries-service-account";

export type SpecialPrize = {
  id: string;
  title: string;
  description: string;
  campaignId: string;
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
  status?: "active" | "paused";
}) {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  if (title.length < 2 || title.length > 100) throw new Error("Title must be between 2 and 100 characters.");
  if (description.length > 500) throw new Error("Description must be 500 characters or fewer.");
  const campaignId = cleanCampaignId(input.campaignId);
  const id = input.id ? String(input.id).trim() : crypto.randomUUID();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid prize ID.");
  const existing = await queryRtdb(`${prizesPath}/${id}`) as any;
  const now = new Date().toISOString();
  const prize: SpecialPrize = {
    id, title, description, campaignId,
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
