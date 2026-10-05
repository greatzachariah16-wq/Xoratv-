import { verifyAdminSession } from "./admin-auth";
import {
  createCreatorProfile, createDataOrder, getDataPriceQuote, createCourseOrder, getAdminCommerceOverview, getCreator, getCreatorCourses, getPromotionTarget,
  getPublicDataPlans,
  getCreatorDashboard, getAdminDataCatalog, syncDataCatalog, updateDataCatalogPrice, updateDataCatalogStatus, getMeleHealth, getMelePlans, getMeleWallet, getVtushareHealth, getVtusharePlans, getVtushareAccount, handleMeleWebhook, handleVtushareWebhook, getPayoutDetails, getPublishedCourses, getUserPurchasedCourseIds,
  saveCourse, deleteCreatorCourse, savePayoutDetails, saveCreatorFeaturedImage, createCreatorPromotionLink, resolvePromotionLink,
  getDiscountCampaigns, createDiscountCampaign, updateDiscountCampaignStatus, recordDiscountPostback, testMelePurchase, testVtusharePurchase,
} from "./commerce-service";
import { getWallet, createWalletDeposit, getWalletDepositStatus } from "./wallet-service";
import { getAdminCpaOverview, runCpaPostbackSelfTest } from "./offerwall-service";


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

  if (path.startsWith("/s/") && request.method === "GET") {
    const token = path.slice(3).split("/")[0];
    const promotion = await resolvePromotionLink(token);
    if (!promotion) return new Response("Promotion link not found.", { status: 404, headers });
    return Response.redirect(new URL(promotion.targetPath, url.origin), 302);
  }
  if (request.method === "OPTIONS" && (path.startsWith("/api/commerce") || path.startsWith("/api/webhooks/mele") || path.startsWith("/api/webhooks/vtushare") || path.startsWith("/api/webhooks/discount-cpa"))) {
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
        return json({ ok: false, error: "Bundle, network, type and recipient number are required." }, 400);
      }
      return json({
        ok: true,
        test: await testVtusharePurchase({
          bundleId: Number(body.bundleId),
          networkId: Number(body.networkId),
          typeId: Number(body.typeId),
          phoneNumber: String(body.phoneNumber),
        }),
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "VTUshare test purchase failed." }, 400);
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

  if (path === "/api/commerce/wallet" && request.method === "GET") {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    return json({ ok: true, wallet: await getWallet(userId) });
  }

  if (path === "/api/commerce/wallet/deposit" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.userId || body.amount === undefined) return json({ ok: false, error: "User and amount are required." }, 400);
      return json({ ok: true, deposit: await createWalletDeposit({ userId: String(body.userId), amount: Number(body.amount) }) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not create wallet funding request." }, 400);
    }
  }

  if (path === "/api/commerce/wallet/deposit/status" && request.method === "GET") {
    const userId = url.searchParams.get("userId");
    const reference = url.searchParams.get("reference");
    if (!userId || !reference) return json({ ok: false, error: "User and deposit reference are required." }, 400);
    try {
      return json({ ok: true, deposit: await getWalletDepositStatus(reference, userId) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not read wallet funding status." }, 404);
    }
  }

  if (path === "/api/commerce/data/plans" && request.method === "GET") {
    try {
      return json({ ok: true, plans: await getPublicDataPlans(url.searchParams.get("refresh") === "1") });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Plan catalog error" }, 500);
    }
  }

  if (path === "/api/commerce/data/quote" && request.method === "GET") {
    try {
      const userId = url.searchParams.get("userId");
      const catalogId = url.searchParams.get("catalogId");
      if (!userId || !catalogId) return json({ ok: false, error: "userId and catalogId are required." }, 400);
      const result = await getDataPriceQuote({ userId, catalogId, usePoints: url.searchParams.get("usePoints") === "1" });
      return json({ ok: true, ...result });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not calculate data price." }, 500);
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

  if (path === "/api/commerce/courses/purchased" && request.method === "GET") {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    return json({ ok: true, courseIds: await getUserPurchasedCourseIds(userId) });
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

  if (path === "/api/commerce/promotion-target" && request.method === "GET") {
    const token = url.searchParams.get("token");
    if (!token) return json({ ok: false, error: "Missing promotion token." }, 400);
    const target = await getPromotionTarget(token);
    if (!target) return json({ ok: false, error: "Promotion target not found." }, 404);
    return json({ ok: true, target });
  }

  if (path === "/api/commerce/creator/dashboard" && request.method === "GET") {
    const userId = url.searchParams.get("userId");
    if (!userId) return json({ ok: false, error: "Missing userId." }, 400);
    return json({ ok: true, dashboard: await getCreatorDashboard(userId) });
  }

  if (path === "/api/commerce/creator/featured-image" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.userId || !body.featuredImageUrl) return json({ ok: false, error: "Featured image is required." }, 400);
      return json({ ok: true, creator: await saveCreatorFeaturedImage(String(body.userId), String(body.featuredImageUrl)) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not save featured image." }, 400);
    }
  }

  if (path === "/api/commerce/creator/promotion-link" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.creatorId || !body.service) return json({ ok: false, error: "Creator and promotion type are required." }, 400);
      if (body.service !== "data" && body.service !== "course") return json({ ok: false, error: "Invalid promotion type." }, 400);
      return json({ ok: true, link: await createCreatorPromotionLink({
        creatorId: String(body.creatorId),
        service: body.service,
        courseId: body.courseId ? String(body.courseId) : null,
      }) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not create promotion link." }, 500);
    }
  }

  if (path === "/api/commerce/creator/course" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.creatorId || !body.title || !body.description) return json({ ok: false, error: "Course title and description are required." }, 400);
      const creator = await getCreator(body.creatorId);
      if (!creator || creator.status !== "active") return json({ ok: false, error: "Creator account is not active." }, 403);
      return json({ ok: true, course: await saveCourse({ ...body, videoPublicId: body.videoPublicId ? String(body.videoPublicId) : null }) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Course creation failed." }, 500);
    }
  }

  if (path === "/api/commerce/creator/course" && request.method === "DELETE") {
    try {
      const body = await request.json();
      if (!body.creatorId || !body.courseId) return json({ ok: false, error: "Creator and course are required." }, 400);
      const creator = await getCreator(String(body.creatorId));
      if (!creator || creator.status !== "active") return json({ ok: false, error: "Creator account is not active." }, 403);
      return json({ ok: true, result: await deleteCreatorCourse(String(body.courseId), String(body.creatorId)) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not delete course." }, 400);
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

  if (path === "/api/admin/commerce/cpa-overview" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      return json({ ok: true, overview: await getAdminCpaOverview() });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not load CPA overview." }, 500);
    }
  }

  if (path === "/api/admin/commerce/cpa-postback-self-test" && request.method === "POST") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      const body = await request.json();
      return json({
        ok: true,
        test: await runCpaPostbackSelfTest({
          trackingId: body.trackingId ? String(body.trackingId) : undefined,
          offerId: body.offerId ? String(body.offerId) : undefined,
          payout: body.payout === undefined ? undefined : Number(body.payout),
        }),
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "CPA postback self-test failed." }, 400);
    }
  }

  if (path === "/api/admin/commerce/discount-campaigns" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      return json({ ok: true, campaigns: await getDiscountCampaigns() });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Discount campaign error." }, 500);
    }
  }

  if (path === "/api/admin/commerce/discount-campaigns" && request.method === "POST") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      const body = await request.json();
      return json({
        ok: true,
        campaign: await createDiscountCampaign({
          name: body.name,
          description: body.description,
          discountType: body.discountType,
          discountValue: Number(body.discountValue),
          appliesTo: body.appliesTo,
          productIds: body.productIds,
          startAt: body.startAt,
          endAt: body.endAt,
          maxRedemptions: body.maxRedemptions,
          cpaProvider: body.cpaProvider,
          cpaOfferId: body.cpaOfferId,
          cpaContentLockUrl: body.cpaContentLockUrl,
          cpaClickIdParameter: body.cpaClickIdParameter,
        }),
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not create discount campaign." }, 400);
    }
  }

  if (path === "/api/admin/commerce/discount-campaigns/status" && request.method === "POST") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      const body = await request.json();
      if (!body.id || !body.status) return json({ ok: false, error: "Campaign id and status are required." }, 400);
      return json({ ok: true, campaign: await updateDiscountCampaignStatus(String(body.id), body.status) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not update campaign status." }, 400);
    }
  }

  if (path === "/api/webhooks/discount-cpa" && request.method === "POST") {
    const configuredSecret = process.env.XORA_CPA_POSTBACK_SECRET?.trim();
    if (!configuredSecret) {
      return json({ ok: false, error: "CPA postback integration is not configured yet." }, 503);
    }
    const suppliedSecret = request.headers.get("x-cpa-postback-secret") || request.headers.get("x-webhook-secret") || "";
    if (suppliedSecret !== configuredSecret) return json({ ok: false, error: "Invalid CPA postback secret." }, 401);
    try {
      const body = await request.json();
      if (!body.campaignId || !body.transactionId || !body.status) {
        return json({ ok: false, error: "campaignId, transactionId and status are required." }, 400);
      }
      const allowed = ["approved", "reversed", "pending", "rejected"];
      if (!allowed.includes(body.status)) return json({ ok: false, error: "Invalid conversion status." }, 400);
      const result = await recordDiscountPostback({
        campaignId: String(body.campaignId),
        transactionId: String(body.transactionId),
        clickId: body.clickId ?? body.subid ?? null,
        userId: body.userId ?? null,
        offerId: body.offerId ?? null,
        status: body.status,
        payload: body,
      });
      return json({ ok: true, ...result });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "CPA postback error." }, 400);
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
        return json({ ok: false, error: "Network, plan and recipient number are required." }, 400);
      }
      return json({
        ok: true,
        test: await testMelePurchase({
          network: String(body.network) as any,
          planId: Number(body.planId),
          phoneNumber: String(body.phoneNumber),
        }),
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "MELE test purchase failed." }, 400);
    }
  }

  return null;
}
