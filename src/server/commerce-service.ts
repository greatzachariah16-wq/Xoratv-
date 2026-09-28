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

// PARTIAL_RESTORE - continuing in next commits
export async function getMelePlans(): Promise<MelePlan[]> { return []; }
export async function getVtusharePlans() { return []; }
export async function syncDataCatalog() { return { records: [], added: 0, updated: 0 }; }
export async function getAdminDataCatalog() { return []; }
export async function getPublicDataPlans() { return []; }
export async function getVtushareHealth() {
  return { connected: false, checkedAt: new Date().toISOString(), credentialsConfigured: false, error: "Restoring commerce-service" };
}
export async function updateDataCatalogPrice() { throw new Error("Restoring"); }
export async function updateDataCatalogStatus() { throw new Error("Restoring"); }
export async function getVtushareAccount() { return null; }
export async function testVtusharePurchase() { throw new Error("Restoring"); }
export async function handleVtushareWebhook() { return { ok: false, status: 503, error: "Restoring" }; }
