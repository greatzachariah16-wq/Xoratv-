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

export async function getMelePlans(force = false): Promise<MelePlan[]> {
  if (!force) {
    const cached = (await queryRtdb("commerce/dataPlans")) as MelePlan[] | Record<string, MelePlan> | null;
    if (cached) {
      const plans = Array.isArray(cached) ? cached : Object.values(cached);
      if (plans.length) return plans;
    }
  }
  const res = await meleFetch("/data/plans");
  const body = (await res.json().catch(() => null)) as { plans?: MelePlan[] } | null;
  if (!res.ok || !Array.isArray(body?.plans)) {
    throw new Error((body as { message?: string } | null)?.message || "Unable to load MELE DATA plans.");
  }
  const plans = body.plans.map((p) => ({ ...p, price: Number(p.price) || 0 }));
  await queryRtdb("commerce/dataPlans", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plans) });
  return plans;
}

export async function getMeleWallet() {
  const res = await meleFetch("/wallet/");
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || "Unable to read MELE wallet.");
  return body;
}

export async function createDataOrder(params: {
  userId: string;
  plan: MelePlan;
  phoneNumber: string;
  referralCode?: string | null;
}) {
  const plans = await getMelePlans();
  const plan = plans.find((p) => Number(p.plan_id) === Number(params.plan.plan_id));
  if (!plan) throw new Error("The selected MELE DATA plan is no longer available.");
  const phoneNumber = String(params.phoneNumber).replace(/\D/g, "");
  if (!/^0\d{10}$/.test(phoneNumber)) throw new Error("Enter a valid 11-digit Nigerian phone number.");
  const orderId = id("data");
  const referralCreatorId = params.referralCode && params.referralCode.endsWith("_data") ? params.referralCode.slice(0, -5) : null;
  const record = {
    id: orderId,
    userId: params.userId,
    planId: plan.plan_id,
    planCode: plan.plan_code,
    network: plan.network,
    dataSize: plan.data_size,
    phoneNumber,
    providerCost: plan.price,
    customerPrice: plan.price,
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
