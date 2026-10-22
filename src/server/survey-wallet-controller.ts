import crypto from "node:crypto";
import { verifyAdminSession } from "./admin-auth";
import { queryRtdb } from "./xseries-service-account";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
const configPath = "commerce/surveyRewardConfig";
const walletsPath = "commerce/surveyWallets";
const payoutsPath = "commerce/surveyPayoutRequests";

type SurveyConfig = { rewardPerSurvey: number; minimumPayout: number; currency: "NGN"; payoutsEnabled: boolean; updatedAt?: string };
const DEFAULT_CONFIG: SurveyConfig = { rewardPerSurvey: 10, minimumPayout: 200, currency: "NGN", payoutsEnabled: true };

async function readObject<T>(path: string): Promise<T> {
  return ((await queryRtdb(path)) || {}) as T;
}
async function write(path: string, value: unknown) {
  await queryRtdb(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
}
async function requireAdmin(request: Request) {
  const session = verifyAdminSession(request);
  if (!session.valid) throw new Error(session.error || "Administrator session required.");
}
async function readConfig(): Promise<SurveyConfig> {
  const stored = await queryRtdb(configPath) as Partial<SurveyConfig> | null;
  return { ...DEFAULT_CONFIG, ...(stored || {}) };
}
async function changeBalance(userId: string, amount: number, transaction: Record<string, unknown>) {
  const path = `${walletsPath}/${encodeURIComponent(userId)}`;
  const current = await queryRtdb(path) as any || {};
  const transactions = current.transactions && typeof current.transactions === "object" ? current.transactions : {};
  const next = {
    userId,
    currency: "NGN",
    balance: Number(current.balance || 0) + amount,
    lifetimeEarned: Number(current.lifetimeEarned || 0) + (amount > 0 && String(transaction.type) === "survey_reward" && ["approved", "successful"].includes(String(transaction.status)) ? amount : 0),
    transactions: { ...transactions, [String(transaction.id)]: transaction },
    updatedAt: new Date().toISOString(),
  };
  if (next.balance < 0) throw new Error("Insufficient available survey balance.");
  await write(path, next);
  return next;
}

export async function handleSurveyWalletRoute(request: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (request.method === "OPTIONS" && (path.startsWith("/api/survey-wallet") || path.startsWith("/api/admin/survey-wallet"))) {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  if (path === "/api/survey-wallet" && request.method === "GET") {
    const userId = url.searchParams.get("userId")?.trim();
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    const [wallet, config, payoutsRaw] = await Promise.all([
      queryRtdb(`${walletsPath}/${encodeURIComponent(userId)}`) as Promise<any>,
      readConfig(),
      readObject<Record<string, any>>(payoutsPath),
    ]);
    const payouts = Object.values(payoutsRaw).filter((p: any) => p?.userId === userId).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const transactions = Object.values(wallet?.transactions || {}).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
    return json({ ok: true, wallet: { balance: Number(wallet?.balance || 0), lifetimeEarned: Number(wallet?.lifetimeEarned || 0), currency: "NGN", transactions }, config: { rewardPerSurvey: config.rewardPerSurvey, minimumPayout: config.minimumPayout, payoutsEnabled: config.payoutsEnabled }, payouts });
  }

  if (path === "/api/survey-wallet/payout" && request.method === "POST") {
    try {
      const body = await request.json() as any;
      const userId = String(body.userId || "").trim();
      const amount = Math.round(Number(body.amount) * 100) / 100;
      if (!userId || userId.length > 160 || !Number.isFinite(amount) || amount <= 0) return json({ ok: false, error: "Enter a valid payout amount." }, 400);
      const submitted = body.payoutDetails && typeof body.payoutDetails === "object" ? body.payoutDetails : {};
      const accountName = String(submitted.accountName || "").trim().slice(0, 120);
      const accountNumber = String(submitted.accountNumber || "").replace(/\D/g, "").slice(0, 10);
      const bankName = String(submitted.bankName || "").trim().slice(0, 100);
      if (accountName.length < 2 || accountNumber.length !== 10 || !bankName) return json({ ok: false, error: "Enter a valid bank, account name, and 10-digit account number." }, 400);
      const config = await readConfig();
      if (!config.payoutsEnabled) return json({ ok: false, error: "Payout requests are temporarily disabled." }, 409);
      if (amount < config.minimumPayout) return json({ ok: false, error: `Minimum payout is ₦${config.minimumPayout.toLocaleString()}.` }, 400);
      const currentPayouts = await readObject<Record<string, any>>(payoutsPath);
      if (Object.values(currentPayouts).some((p: any) => p?.userId === userId && ["requested", "under_review", "on_hold", "approved"].includes(p?.status))) {
        return json({ ok: false, error: "You already have a payout request being processed." }, 409);
      }
      const wallet = await queryRtdb(`${walletsPath}/${encodeURIComponent(userId)}`) as any || {};
      if (Number(wallet.balance || 0) < amount) return json({ ok: false, error: "Insufficient available survey balance." }, 400);
      const payoutId = makeId("survey-payout");
      const now = new Date().toISOString();
      const payout = { id: payoutId, userId, amount, currency: "NGN", status: "requested", createdAt: now, updatedAt: now, payoutMethod: "manual_bank_transfer", payoutDetails: { accountName, accountNumber, bankName } };
      await changeBalance(userId, -amount, { id: makeId("survey-reserve"), type: "payout_reservation", amount: -amount, status: "reserved", reference: payoutId, description: "Survey payout request reserved", createdAt: now });
      try {
        await write(`${payoutsPath}/${payoutId}`, payout);
      } catch (error) {
        await changeBalance(userId, amount, { id: makeId("survey-release"), type: "payout_release", amount, status: "successful", reference: payoutId, description: "Payout reservation released after request creation failed", createdAt: new Date().toISOString() });
        throw error;
      }
      return json({ ok: true, payout }, 201);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Could not request payout." }, 400);
    }
  }

  if (path === "/api/admin/survey-wallet/config" && request.method === "GET") {
    try { await requireAdmin(request); return json({ ok: true, config: await readConfig() }); }
    catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Unauthorized." }, 401); }
  }
  if (path === "/api/admin/survey-wallet/config" && request.method === "POST") {
    try {
      await requireAdmin(request);
      const body = await request.json() as any;
      const rewardPerSurvey = Number(body.rewardPerSurvey);
      const minimumPayout = Number(body.minimumPayout);
      if (!Number.isFinite(rewardPerSurvey) || rewardPerSurvey < 0 || rewardPerSurvey > 100000 || !Number.isFinite(minimumPayout) || minimumPayout < 1 || minimumPayout > 10000000) return json({ ok: false, error: "Enter valid reward and minimum payout values." }, 400);
      const config: SurveyConfig = { rewardPerSurvey: Math.round(rewardPerSurvey * 100) / 100, minimumPayout: Math.round(minimumPayout * 100) / 100, currency: "NGN", payoutsEnabled: body.payoutsEnabled !== false, updatedAt: new Date().toISOString() };
      await write(configPath, config);
      return json({ ok: true, config });
    } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Could not save reward settings." }, 401); }
  }
  if (path === "/api/admin/survey-wallet/payouts" && request.method === "GET") {
    try {
      await requireAdmin(request);
      const raw = await readObject<Record<string, any>>(payoutsPath);
      return json({ ok: true, payouts: Object.values(raw).filter(Boolean).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Unauthorized." }, 401); }
  }
  if (path === "/api/admin/survey-wallet/payouts/review" && request.method === "POST") {
    try {
      await requireAdmin(request);
      const body = await request.json() as any;
      const payoutId = String(body.payoutId || "");
      const decision = String(body.decision || "");
      if (!payoutId || !["under_review", "on_hold", "approved", "paid", "rejected"].includes(decision)) return json({ ok: false, error: "Valid payout and status are required." }, 400);
      const payout = await queryRtdb(`${payoutsPath}/${encodeURIComponent(payoutId)}`) as any;
      if (!payout) return json({ ok: false, error: "Payout request not found." }, 404);
      if (payout.status === "paid" || payout.status === "rejected") return json({ ok: false, error: "This payout request is already closed." }, 409);
      const now = new Date().toISOString();
      const updated = { ...payout, status: decision, updatedAt: now, adminNote: String(body.note || "").trim().slice(0, 1000), ...(decision === "paid" ? { paidAt: now, paymentReference: String(body.paymentReference || "").trim().slice(0, 160) } : {}) };
      if (decision === "rejected") await changeBalance(String(payout.userId), Number(payout.amount), { id: makeId("survey-release"), type: "payout_release", amount: Number(payout.amount), status: "successful", reference: payout.id, description: "Survey payout request rejected; reserved balance released", createdAt: now });
      await write(`${payoutsPath}/${encodeURIComponent(payoutId)}`, updated);
      return json({ ok: true, payout: updated });
    } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Could not update payout." }, 400); }
  }

  return null;
}
