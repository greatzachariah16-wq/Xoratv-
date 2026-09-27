import { verifyAdminSession } from "./admin-auth";
import {
  createCreatorProfile, createDataOrder, createCourseOrder, getAdminCommerceOverview, getCreator, getCreatorCourses,
  getPublicDataPlans,
  getCreatorDashboard, getAdminDataCatalog, syncDataCatalog, updateDataCatalogPrice, updateDataCatalogStatus, getMeleHealth, getMelePlans, getMeleWallet, getVtushareHealth, getVtusharePlans, getVtushareAccount, handleMeleWebhook, handleVtushareWebhook, testMelePurchase, testVtusharePurchase, getPayoutDetails, getPublishedCourses,
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
  if (request.method === "OPTIONS" && (path.startsWith("/api/commerce") || path.startsWith("/api/webhooks/mele") || path.startsWith("/api/webhooks/vtushare"))) {
    return new Response(null, { status: 204, headers });
  }

  if (path === "/api/webhooks/mele" && request.method === "GET") {
    return json({
      ok: true,
      service: "mele-webhook",
      ready: Boolean(process.env.MELE_WEBHOOK_SECRET?.trim()),
      endpoint: "/api/webhooks/mele",
    });
  }

  if (path === "/api/webhooks/mele" && request.method === "POST") {
    try {
      const result = await handleMeleWebhook(request);
      return json(result, result.status);
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "MELE webhook error." }, 500);
    }
  }

  if (path === "/api/webhooks/vtushare" && request.method === "GET") {
    return json({
      ok: true,
      service: "vtushare-webhook",
      ready: true,
      secretConfigured: Boolean(process.env.VTUSHARE_WEBHOOK_SECRET?.trim()),
      endpoint: "/api/webhooks/vtushare",
    });
  }

  if (path === "/api/webhooks/vtushare" && request.method === "POST") {
    try {
      const result = await handleVtushareWebhook(request);
      return json(result, result.status);
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "VTUshare webhook error." }, 500);
    }
  }

  if (path === "/api/commerce/vtushare/plans" && request.method === "GET") {
    try {
      return json({ ok: true, plans: await getVtusharePlans(url.searchParams.get("refresh") === "1") });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "VTUshare plan catalog error." }, 500);
    }
  }

  if (path === "/api/admin/commerce/vtushare-health" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    return json({ ok: true, health: await getVtushareHealth() });
  }

  if (path === "/api/admin/commerce/vtushare-test-purchase" && request.method === "POST") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      const body = await request.json();
      if (!body.bundleId || !body.networkId || !body.typeId || !body.phoneNumber) {
        return json({ ok: false, error: "bundleId, networkId, typeId and phoneNumber are required." }, 400);
      }
      return json({
        ok: true,
        test: await testVtusharePurchase({
          bundleId: Number(body.bundleId),
          networkId: Number(body.networkId),
          typeId: Number(body.typeId),
          phoneNumber: body.phoneNumber,
        }),
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "VTUshare purchase test failed." }, 500);
    }
  }

  if (path === "/api/admin/commerce/vtushare-account" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      return json({ ok: true, account: await getVtushareAccount() });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "VTUshare account error." }, 500);
    }
  }

  if (path === "/api/commerce/data/plans" && request.method === "GET") {
    try {
      return json({ ok: true, plans: await getPublicDataPlans(url.searchParams.get("refresh") === "1") });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Plan catalog error" }, 500);
    }
  }

  if (path === "/api/commerce/data/order" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.userId || !body.catalogId || !body.phoneNumber) return json({ ok: false, error: "Missing purchase details." }, 400);
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

  if (path === "/api/admin/commerce/data-catalog" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      return json({ ok: true, catalog: await getAdminDataCatalog(url.searchParams.get("refresh") === "1") });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Data catalogue error." }, 500);
    }
  }

  if (path === "/api/admin/commerce/data-catalog/sync" && request.method === "POST") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      return json({ ok: true, result: await syncDataCatalog() });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Data catalogue sync failed." }, 500);
    }
  }

  if (path === "/api/admin/commerce/data-catalog/price" && request.method === "POST") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      const body = await request.json();
      if (!body.catalogId || body.customerPrice === undefined) return json({ ok: false, error: "catalogId and customerPrice are required." }, 400);
      return json({ ok: true, plan: await updateDataCatalogPrice(body.catalogId, Number(body.customerPrice)) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not update data price." }, 500);
    }
  }

  if (path === "/api/admin/commerce/data-catalog/status" && request.method === "POST") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      const body = await request.json();
      if (!body.catalogId || !body.status) return json({ ok: false, error: "catalogId and status are required." }, 400);
      return json({ ok: true, plan: await updateDataCatalogStatus(body.catalogId, body.status) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not update catalogue status." }, 500);
    }
  }

  if (path === "/api/admin/commerce/overview" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    return json({ ok: true, overview: await getAdminCommerceOverview() });
  }

  if (path === "/api/admin/commerce/mele-health" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    const health = await getMeleHealth();
    return json({ ok: true, health });
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


  if (path === "/api/admin/commerce/mele-test-purchase" && request.method === "POST") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      const body = await request.json();
      if (!body.network || !body.planId || !body.phoneNumber) {
        return json({ ok: false, error: "Network, planId and phoneNumber are required." }, 400);
      }
      return json({ ok: true, test: await testMelePurchase({
        network: body.network,
        planId: Number(body.planId),
        phoneNumber: body.phoneNumber,
      }) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "MELE purchase test failed." }, 500);
    }
  }

  return null;
}
