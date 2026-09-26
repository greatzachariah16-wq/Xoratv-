import { verifyAdminSession } from "./admin-auth";
import {
  createCreatorProfile, createDataOrder, createCourseOrder, getAdminCommerceOverview, getCreator, getCreatorCourses,
  getCreatorDashboard, getMelePlans, getMeleWallet, getPayoutDetails, getPublishedCourses,
  saveCourse, savePayoutDetails,
} from "./commerce-service";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

export async function handleCommerceRoute(request: Request, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (request.method === "OPTIONS" && path.startsWith("/api/commerce")) return new Response(null, { status: 204, headers });

  if (path === "/api/commerce/data/plans" && request.method === "GET") {
    try {
      return json({ ok: true, plans: await getMelePlans(url.searchParams.get("refresh") === "1") });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Plan catalog error" }, 500);
    }
  }

  if (path === "/api/commerce/data/order" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.userId || !body.plan || !body.phoneNumber) return json({ ok: false, error: "Missing purchase details." }, 400);
      const order = await createDataOrder(body);
      return json({ ok: true, order });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not create data order." }, 500);
    }
  }

  if (path === "/api/commerce/courses" && request.method === "GET") {
    return json({ ok: true, courses: await getPublishedCourses() });
  }

  if (path === "/api/commerce/course/order" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.userId || !body.courseId) return json({ ok: false, error: "Missing course order details." }, 400);
      return json({ ok: true, order: await createCourseOrder(body) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not create course order." }, 500);
    }
  }

  if (path === "/api/commerce/creator/courses" && request.method === "GET") {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    return json({ ok: true, courses: await getCreatorCourses(userId) });
  }

  if (path === "/api/commerce/creator/register" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.userId || !body.displayName || !body.username) return json({ ok: false, error: "Display name and username are required." }, 400);
      return json({ ok: true, creator: await createCreatorProfile(body) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Creator registration failed." }, 500);
    }
  }

  if (path === "/api/commerce/creator/dashboard" && request.method === "GET") {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    return json({ ok: true, dashboard: await getCreatorDashboard(userId) });
  }

  if (path === "/api/commerce/creator/course" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.creatorId || !body.title || !body.description) return json({ ok: false, error: "Course title and description are required." }, 400);
      const creator = await getCreator(body.creatorId);
      if (!creator || creator.status !== "active") return json({ ok: false, error: "Creator account is not active." }, 403);
      return json({ ok: true, course: await saveCourse(body) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Course creation failed." }, 500);
    }
  }

  if (path === "/api/commerce/creator/payout" && request.method === "GET") {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    return json({ ok: true, payout: await getPayoutDetails(userId) });
  }

  if (path === "/api/commerce/creator/payout" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.userId || !body.accountName || !body.accountNumber || !body.bankName) return json({ ok: false, error: "Complete bank details are required." }, 400);
      return json({ ok: true, payout: await savePayoutDetails(body.userId, body) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Payout details could not be saved." }, 500);
    }
  }

  if (path === "/api/admin/commerce/overview" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    return json({ ok: true, overview: await getAdminCommerceOverview() });
  }

  if (path === "/api/admin/commerce/mele-wallet" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      return json({ ok: true, wallet: await getMeleWallet() });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "MELE wallet error." }, 500);
    }
  }

  return null;
}
