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
const applicationsPath = "creatorProgram/applications";
const surveyConfigPath = "commerce/surveyRewardConfig";
const surveyWalletsPath = "commerce/surveyWallets";
const surveyPayoutsPath = "commerce/surveyPayoutRequests";

type CreatorApplication = {
  id: string; userId: string; fullName: string; email: string; username: string;
  channelName: string; country: string; category: string; about: string; sampleUrl: string;
  socials: Record<string, { url: string; audience: string }>;
  status: "pending" | "under_review" | "approved" | "rejected";
  source?: string; createdAt: string; updatedAt: string; reviewedAt?: string; reviewNote?: string;
};
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
async function readSurveyConfig(): Promise<SurveyConfig> {
  const stored = await queryRtdb(surveyConfigPath) as Partial<SurveyConfig> | null;
  return { ...DEFAULT_CONFIG, ...(stored || {}) };
}
async function changeSurveyBalance(userId: string, amount: number, transaction: Record<string, unknown>) {
  const path = `${surveyWalletsPath}/${encodeURIComponent(userId)}`;
  const current = await queryRtdb(path) as any || {};
  const transactions = current.transactions && typeof current.transactions === "object" ? current.transactions : {};
  const next = {
    userId, currency: "NGN", balance: Number(current.balance || 0) + amount,
    lifetimeEarned: Number(current.lifetimeEarned || 0) + (amount > 0 && String(transaction.type) === "survey_reward" ? amount : 0),
    transactions: { ...transactions, [String(transaction.id)]: transaction },
    updatedAt: new Date().toISOString(),
  };
  if (next.balance < 0) throw new Error("Insufficient available survey balance.");
  await write(path, next);
  return next;
}

export async function handleCreatorProgramRoute(request: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (request.method === "OPTIONS" && (path.startsWith("/api/creator-applications") || path.startsWith("/api/admin/creator-applications") || path.startsWith("/api/survey-wallet") || path.startsWith("/api/admin/survey-wallet"))) {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  if (path === "/api/creator-applications" && request.method === "POST") {
    try {
      const body = await request.json() as any;
      const userId = String(body.userId || body.applicantId || "").trim();
      if (!userId || userId.length > 160) return json({ ok: false, error: "Sign in before submitting an application." }, 400);
      const existing = await queryRtdb(`${applicationsPath}/${encodeURIComponent(userId)}`) as CreatorApplication | null;
      if (existing && ["pending", "under_review", "approved"].includes(existing.status)) {
        return json({ ok: false, error: "You already have an active creator application." }, 409);
      }
      const fullName = String(body.fullName || "").trim();
      const username = String(body.username || "").trim().replace(/^@/, "").toLowerCase();
      const socials = body.socials && typeof body.socials === "object" ? body.socials : {};
      const validSocial = Object.values(socials as Record<string, any>).some((social: any) =>
        /^https?:\/\//i.test(String(social?.url || "")) && Number(social?.audience || 0) >= 50
      );
      if (!fullName || !username || !String(body.email || "").includes("@") || !String(body.about || "").trim() || !validSocial) {
        return json({ ok: false, error: "Complete the required fields and include a public social profile with at least 50 followers or subscribers." }, 400);
      }
      const now = new Date().toISOString();
      const record: CreatorApplication = {
        id: makeId("creator-application"), userId, fullName, email: String(body.email).trim().slice(0, 254),
        username, channelName: String(body.channelName || "").trim().slice(0, 100),
        country: String(body.country || "Nigeria").trim().slice(0, 80),
        category: String(body.category || "Other").trim().slice(0, 80),
        about: String(body.about).trim().slice(0, 1500), sampleUrl: String(body.sampleUrl || "").trim().slice(0, 1000),
        socials, status: "pending", source: String(body.source || "xora").slice(0, 80), createdAt: now, updatedAt: now,
      };
      await write(`${applicationsPath}/${encodeURIComponent(userId)}`, record);
      return json({ ok: true, application: { id: record.id, status: record.status, createdAt: now } }, 201);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Could not submit creator application." }, 500);
    }
  }

  if (path === "/api/creator-applications/status" && request.method === "GET") {
    const userId = url.searchParams.get("userId")?.trim();
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    const application = await queryRtdb(`${applicationsPath}/${encodeURIComponent(userId)}`) as CreatorApplication | null;
    return json({ ok: true, application: application ? { id: application.id, status: application.status, createdAt: application.createdAt, updatedAt: application.updatedAt, reviewNote: application.reviewNote || null } : null });
  }

  if (path === "/api/admin/creator-applications" && request.method === "GET") {
    try {
      await requireAdmin(request);
      const raw = await readObject<Record<string, CreatorApplication>>(applicationsPath);
      const applications = Object.values(raw).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json({ ok: true, applications });
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Could not load applications." }, 401);
    }
  }

  if (path === "/api/admin/creator-applications/review" && request.method === "POST") {
    try {
      await requireAdmin(request);
      const body = await request.json() as any;
      const userId = String(body.userId || "").trim();
      const decision = String(body.decision || "");
      if (!userId || !["approved", "rejected", "under_review"].includes(decision)) return json({ ok: false, error: "Valid applicant and decision are required." }, 400);
      const key = encodeURIComponent(userId);
      const application = await queryRtdb(`${applicationsPath}/${key}`) as CreatorApplication | null;
      if (!application) return json({ ok: false, error: "Application not found." }, 404);
      const now = new Date().toISOString();
      const updated = { ...application, status: decision, updatedAt: now, reviewedAt: now, reviewNote: String(body.note || "").trim().slice(0, 1000) } as CreatorApplication;
      await write(`${applicationsPath}/${key}`, updated);
      if (decision === "approved") {
        const existingCreator = await queryRtdb(`commerce/creators/${key}`) as any;
        const creator = {
          ...(existingCreator || {}), id: userId, userId,
          displayName: application.channelName || application.fullName,
          username: application.username, status: "active",
          applicationId: application.id, approvedAt: now, createdAt: existingCreator?.createdAt || now, updatedAt: now,
        };
        await write(`commerce/creators/${key}`, creator);
      } else if (decision === "rejected") {
        const creator = await queryRtdb(`commerce/creators/${key}`) as any;
        if (creator?.applicationId === application.id) await write(`commerce/creators/${key}`, { ...creator, status: "suspended", updatedAt: now });
      }
      return json({ ok: true, application: updated });
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Could not review application." }, 401);
    }
  }

  if (path === "/api/survey-wallet" && request.method === "GET") {
    const userId = url.searchParams.get("userId")?.trim();
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    const [wallet, config, payoutsRaw] = await Promise.all([
      queryRtdb(`${surveyWalletsPath}/${encodeURIComponent(userId)}`) as Promise<any>,
      readSurveyConfig(),
      readObject<Record<string, any>>(surveyPayoutsPath),
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
      if (!userId || !Number.isFinite(amount) || amount <= 0) return json({ ok: false, error: "Enter a valid payout amount." }, 400);
      const config = await readSurveyConfig();
      if (!config.payoutsEnabled) return json({ ok: false, error: "Payout requests are temporarily disabled." }, 409);
      if (amount < config.minimumPayout) return json({ ok: false, error: `Minimum payout is ₦${config.minimumPayout.toLocaleString()}.` }, 400);
      const currentPayouts = await readObject<Record<string, any>>(surveyPayoutsPath);
      if (Object.values(currentPayouts).some((p: any) => p?.userId === userId && ["requested", "under_review", "on_hold", "approved"].includes(p?.status))) {
        return json({ ok: false, error: "You already have a payout request being processed." }, 409);
      }
      const currentWallet = await queryRtdb(`${surveyWalletsPath}/${encodeURIComponent(userId)}`) as any || {};
      if (Number(currentWallet.balance || 0) < amount) return json({ ok: false, error: "Insufficient available survey balance." }, 400);
      const payoutId = makeId("survey-payout");
      const now = new Date().toISOString();
      const payout = { id: payoutId, userId, amount, currency: "NGN", status: "requested", createdAt: now, updatedAt: now, payoutMethod: String(body.payoutMethod || "manual_bank_transfer").slice(0, 60), payoutDetails: body.payoutDetails && typeof body.payoutDetails === "object" ? body.payoutDetails : null };
      // Reserve funds by reducing available balance and recording the reservation transaction.
      await changeSurveyBalance(userId, -amount, { id: makeId("survey-reserve"), type: "payout_reservation", amount: -amount, status: "reserved", reference: payoutId, description: "Survey payout request reserved", createdAt: now });
      await write(`${surveyPayoutsPath}/${payoutId}`, payout);
      return json({ ok: true, payout }, 201);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Could not request payout." }, 400);
    }
  }

  if (path === "/api/admin/survey-wallet/config" && request.method === "GET") {
    try { await requireAdmin(request); return json({ ok: true, config: await readSurveyConfig() }); }
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
      await write(surveyConfigPath, config);
      return json({ ok: true, config });
    } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Could not save reward settings." }, 401); }
  }
  if (path === "/api/admin/survey-wallet/payouts" && request.method === "GET") {
    try {
      await requireAdmin(request);
      const raw = await readObject<Record<string, any>>(surveyPayoutsPath);
      return json({ ok: true, payouts: Object.values(raw).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Unauthorized." }, 401); }
  }
  if (path === "/api/admin/survey-wallet/payouts/review" && request.method === "POST") {
    try {
      await requireAdmin(request);
      const body = await request.json() as any;
      const payoutId = String(body.payoutId || "");
      const decision = String(body.decision || "");
      if (!payoutId || !["under_review", "on_hold", "approved", "paid", "rejected"].includes(decision)) return json({ ok: false, error: "Valid payout and status are required." }, 400);
      const payout = await queryRtdb(`${surveyPayoutsPath}/${encodeURIComponent(payoutId)}`) as any;
      if (!payout) return json({ ok: false, error: "Payout request not found." }, 404);
      if (payout.status === "paid" || payout.status === "rejected") return json({ ok: false, error: "This payout request is already closed." }, 409);
      const now = new Date().toISOString();
      const updated = { ...payout, status: decision, updatedAt: now, adminNote: String(body.note || "").trim().slice(0, 1000), ...(decision === "paid" ? { paidAt: now, paymentReference: String(body.paymentReference || "").trim().slice(0, 160) } : {}) };
      if (decision === "rejected") {
        await changeSurveyBalance(String(payout.userId), Number(payout.amount), { id: makeId("survey-release"), type: "payout_release", amount: Number(payout.amount), status: "successful", reference: payout.id, description: "Survey payout request rejected; reserved balance released", createdAt: now });
      }
      await write(`${surveyPayoutsPath}/${encodeURIComponent(payoutId)}`, updated);
      return json({ ok: true, payout: updated });
    } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Could not update payout." }, 400); }
  }

  return null;
}
