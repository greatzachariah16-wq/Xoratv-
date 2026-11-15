import { verifyAdminSession } from "./admin-auth";
import { timingSafeEqual } from "node:crypto";
import { getAuthenticatedUserId } from "./session-auth";
import {
  createCreatorProfile, createDataOrder, getDataPriceQuote, createCourseOrder, getAdminCommerceOverview, getCreator, getCreatorCourses, createCreatorPost, getPromotionTarget,
  getPublicDataPlans,
  getCreatorDashboard, getAdminDataCatalog, syncDataCatalog, updateDataCatalogPrice, updateDataCatalogStatus, getMeleHealth, getMelePlans, getMeleWallet, getDataRewardStatus, claimMeleDataReward, refreshMeleDataRewardClaim, getVtushareHealth, getVtusharePlans, getVtushareAccount, handleMeleWebhook, handleVtushareWebhook, getPayoutDetails, getPublishedCourses, getUserPurchasedCourseIds,
  saveCourse, deleteCreatorCourse, deleteCreatorShort, savePayoutDetails, saveCreatorFeaturedImage, createCreatorPromotionLink, resolvePromotionLink, recordCreatorReferralClick, createCreatorPayoutRequest, getCreatorPayoutRequests, getAdminCreatorPayoutRequests,
  getDiscountCampaigns, createDiscountCampaign, updateDiscountCampaignStatus, recordDiscountPostback, testMelePurchase, testVtusharePurchase, saveCreatorCustomization, recordVasBillingEvent,
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

  if (path === "/api/webhooks/vas" && request.method === "POST") {
    const expectedSecret = String(process.env.XORA_VAS_WEBHOOK_SECRET || "");
    const suppliedSecret = String(request.headers.get("x-xora-vas-secret") || "");
    if (!expectedSecret) return json({ ok: false, error: "VAS billing is not enabled on this server." }, 503);
    const expectedBytes = Buffer.from(expectedSecret);
    const suppliedBytes = Buffer.from(suppliedSecret);
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
      return json({ ok: false, error: "Invalid VAS webhook credentials." }, 401);
    }
    let body: any;
    try { body = await request.json(); }
    catch { return json({ ok: false, error: "The VAS callback body must be valid JSON." }, 400); }
    try {
      const result = await recordVasBillingEvent({
        eventId: String(body.eventId || ""),
        eventType: String(body.eventType || body.event || "") as "payment.succeeded" | "payment.reversed" | "subscription.cancelled",
        userId: String(body.userId || ""),
        subscriptionId: String(body.subscriptionId || ""),
        amount: Number(body.amount),
        currency: String(body.currency || "NGN").toUpperCase() as "NGN",
        provider: body.provider ? String(body.provider) : "vas-provider",
        occurredAt: body.occurredAt ? String(body.occurredAt) : undefined,
      });
      return json({ ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "VAS billing event could not be recorded.";
      return json({ ok: false, error: message }, message === "VAS commission configuration is not enabled." ? 503 : 400);
    }
  }


  if (path.startsWith("/s/") && request.method === "GET") {
    const token = path.slice(3).split("/")[0];
    const promotion = await resolvePromotionLink(token);
    if (!promotion || promotion.service === "special-prize") return new Response("Promotion link not found or no longer active.", { status: 404, headers });
    const redirect = new Response(null, { status: 302, headers: { Location: new URL(promotion.targetPath, url.origin).toString() } });
    const hasReferralCookie = request.headers.get("cookie")?.split(";").some((part) => part.trim().startsWith("xora_creator_referral="));
    if (promotion.service === "data-reward" && !hasReferralCookie) {
      const click = await recordCreatorReferralClick(token).catch(() => null);
      redirect.headers.append("Set-Cookie", `xora_creator_referral=${encodeURIComponent(token)}; Path=/; Max-Age=315360000; HttpOnly; Secure; SameSite=Lax`);
      if (click?.clickId) redirect.headers.append("Set-Cookie", `xora_creator_click=${encodeURIComponent(click.clickId)}; Path=/; Max-Age=315360000; HttpOnly; Secure; SameSite=Lax`);
    }
    return redirect;
  }
  if (request.method === "OPTIONS" && (path.startsWith("/api/commerce") || path.startsWith("/api/webhooks/mele") || path.startsWith("/api/webhooks/vtushare") || path.startsWith("/api/webhooks/discount-cpa"))) {
    return new Response(null, { status: 204, headers });
  }

  if (path === "/api/commerce/data-rewards" && request.method === "GET") {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in to view your Data Rewards." }, 401);
    try {
      return json({ ok: true, ...(await getDataRewardStatus(authenticatedUserId)) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not load your Data Rewards." }, 500);
    }
  }

  if (path === "/api/commerce/data-rewards/plans" && request.method === "GET") {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in to view available data plans." }, 401);
    try {
      const plans = await getMelePlans(true);
      return json({ ok: true, plans: plans.map((plan) => ({ plan_id: plan.plan_id, network: plan.network, plan_name: plan.plan_name, data_size: plan.data_size, validity: plan.validity, price: plan.price })) });
    } catch (e) {
      return json({ ok: false, error: "Current data plans are temporarily unavailable. Please try again shortly." }, 502);
    }
  }

  if (path === "/api/commerce/data-rewards/claim-status" && request.method === "GET") {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in to check your data reward." }, 401);
    const reference = String(url.searchParams.get("reference") || "").trim();
    if (!reference) return json({ ok: false, error: "A transaction reference is required." }, 400);
    try {
      const claim = await refreshMeleDataRewardClaim(authenticatedUserId, reference);
      return json({ ok: true, claim });
    } catch (e) {
      return json({ ok: false, error: "Could not check the transaction status. Please try again." }, 400);
    }
  }

  if (path === "/api/commerce/data-rewards/claim" && request.method === "POST") {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in to claim data rewards." }, 401);
    try {
      const body = await request.json() as Record<string, unknown>;
      const claim = await claimMeleDataReward({
        userId: authenticatedUserId,
        planId: Number(body.planId),
        network: String(body.network || "").toUpperCase() as any,
        phoneNumber: String(body.phoneNumber || ""),
        referralCode: String(body.referralCode || ""),
      });
      return json({ ok: true, claim });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Data reward claim failed.";
      const conflict = /still being processed|still being confirmed|again after|already claimed|insufficient/i.test(message);
      return json({ ok: false, error: message }, conflict ? 409 : 400);
    }
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
      const authenticatedUserId = await getAuthenticatedUserId(request);
      if (!authenticatedUserId) return json({ ok: false, error: "Sign in before unlocking a course." }, 401);
      const body = await request.json();
      if (!body.courseId) return json({ ok: false, error: "Missing course details." }, 400);
      return json({ ok: true, order: await createCourseOrder({ ...body, userId: authenticatedUserId, paymentMethod: "points" }) });
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
      const authenticatedUserId = await getAuthenticatedUserId(request);
      if (!authenticatedUserId) return json({ ok: false, error: "Sign in to Xora before creating an X Channel." }, 401);
      const body = await request.json();
      if (!body.displayName || !body.username) return json({ ok: false, error: "Display name and username are required." }, 400);
      return json({ ok: true, creator: await createCreatorProfile({ ...body, userId: authenticatedUserId }) });
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
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in to view your creator dashboard." }, 401);
    const requestedUserId = url.searchParams.get("userId");
    if (requestedUserId && requestedUserId !== authenticatedUserId) return json({ ok: false, error: "You can only view your own creator dashboard." }, 403);
    return json({ ok: true, dashboard: await getCreatorDashboard(authenticatedUserId) });
  }

  if (path === "/api/commerce/creator/customization" && request.method === "POST") {
    try {
      const body = await request.json();
      if (!body.userId) return json({ ok: false, error: "User ID is required." }, 400);
      return json({ ok: true, creator: await saveCreatorCustomization(String(body.userId), {
        channelBio: String(body.channelBio ?? ""),
        featuredTitle: String(body.featuredTitle ?? ""),
        featuredDescription: String(body.featuredDescription ?? ""),
        showCourses: body.showCourses !== false,
        showCommunity: body.showCommunity !== false,
      }) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not save channel customization." }, 400);
    }
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

  if (path === "/api/commerce/creator/data-reward-link" && request.method === "POST") {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in before creating a referral link." }, 401);
    try {
      const creator = await getCreator(authenticatedUserId);
      if (!creator || creator.status !== "active") return json({ ok: false, error: "Only active X Channel creators can create referral links." }, 403);
      return json({ ok: true, link: await createCreatorPromotionLink({ creatorId: authenticatedUserId, service: "data-reward" }) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not create your referral link." }, 400);
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

  if (path === "/api/commerce/creator/post" && request.method === "POST") {
    try {
      const authenticatedUserId = await getAuthenticatedUserId(request);
      if (!authenticatedUserId) return json({ ok: false, error: "Sign in before publishing." }, 401);
      const body = await request.json() as Record<string, unknown>;
      const kind = body.kind === "video" ? "video" : body.kind === "text" ? "text" : null;
      if (!kind) return json({ ok: false, error: "Choose a valid post type." }, 400);
      if (kind === "text" && !String(body.posterPath || "").trim()) {
        return json({ ok: false, error: "Add a picture to your post before publishing." }, 400);
      }
      if (kind === "video" && !String(body.streamUrl || body.mediaPath || "").trim()) {
        return json({ ok: false, error: "Upload a video before publishing." }, 400);
      }
      const post = await createCreatorPost({
        userId: authenticatedUserId,
        kind,
        title: String(body.title || "").trim() || null,
        caption: String(body.caption || "").trim() || null,
        mediaPath: String(body.mediaPath || "").trim() || null,
        posterPath: String(body.posterPath || "").trim() || null,
        streamUrl: String(body.streamUrl || "").trim() || null,
        durationSeconds: body.durationSeconds == null ? null : (Number.isFinite(Number(body.durationSeconds)) ? Number(body.durationSeconds) : null),
      });
      return json({ ok: true, post });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not publish post." }, 500);
    }
  }

  if (path === "/api/commerce/creator/short" && request.method === "DELETE") {
    try {
      const body = await request.json();
      if (!body.creatorId || !body.postId) return json({ ok: false, error: "Creator and Short are required." }, 400);
      const creator = await getCreator(String(body.creatorId));
      if (!creator || creator.status !== "active") return json({ ok: false, error: "Creator account is not active." }, 403);
      return json({ ok: true, result: await deleteCreatorShort(String(body.postId), String(body.creatorId)) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not delete Short." }, 400);
    }
  }

  if (path === "/api/commerce/creator/course" && request.method === "POST") {
    try {
      const authenticatedUserId = await getAuthenticatedUserId(request);
      if (!authenticatedUserId) return json({ ok: false, error: "Sign in before publishing a course." }, 401);
      const body = await request.json();
      if (!body.title || !body.description) return json({ ok: false, error: "Course title and description are required." }, 400);
      if (!body.thumbnailUrl) return json({ ok: false, error: "A course thumbnail is required." }, 400);
      if (typeof body.description !== "string" || body.description.trim().length > 500) return json({ ok: false, error: "Course description must be 500 characters or fewer." }, 400);
      if (!Array.isArray(body.lessons) || body.lessons.length < 1 || body.lessons.length > 50 || body.lessons.some((lesson: any) => !String(lesson?.title || "").trim() || !String(lesson?.videoUrl || "").trim())) return json({ ok: false, error: "Add a title and uploaded video for every lesson (maximum 50 lessons)." }, 400);
      const creator = await getCreator(authenticatedUserId);
      if (!creator || creator.status !== "active") return json({ ok: false, error: "Only active X Channel creators can publish courses." }, 403);
      return json({ ok: true, course: await saveCourse({ ...body, creatorId: authenticatedUserId, videoPublicId: body.videoPublicId ? String(body.videoPublicId) : null }) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Course creation failed." }, 500);
    }
  }

  if (path === "/api/commerce/creator/course" && request.method === "DELETE") {
    try {
      const authenticatedUserId = await getAuthenticatedUserId(request);
      if (!authenticatedUserId) return json({ ok: false, error: "Sign in before managing courses." }, 401);
      const body = await request.json();
      if (!body.courseId) return json({ ok: false, error: "Course is required." }, 400);
      const creator = await getCreator(authenticatedUserId);
      if (!creator || creator.status !== "active") return json({ ok: false, error: "Only active X Channel creators can manage courses." }, 403);
      return json({ ok: true, result: await deleteCreatorCourse(String(body.courseId), authenticatedUserId) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not delete course." }, 400);
    }
  }

  if (path === "/api/commerce/creator/payout" && request.method === "GET") {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in to view payout details." }, 401);
    return json({ ok: true, payout: await getPayoutDetails(authenticatedUserId) });
  }

  if (path === "/api/commerce/creator/payout" && request.method === "POST") {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in before saving payout details." }, 401);
    try {
      const body = await request.json();
      const accountName = String(body.accountName || "").trim();
      const accountNumber = String(body.accountNumber || "").replace(/\D/g, "");
      const bankName = String(body.bankName || "").trim();
      if (!accountName || accountNumber.length !== 10 || !bankName) return json({ ok: false, error: "Enter the recipient account name, a valid 10-digit account number and select a bank." }, 400);
      return json({ ok: true, payout: await savePayoutDetails(authenticatedUserId, { accountName, accountNumber, bankName }) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Payout details could not be saved." }, 400);
    }
  }

  if (path === "/api/commerce/creator/payout-request" && request.method === "GET") {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in to view payout requests." }, 401);
    return json({ ok: true, requests: await getCreatorPayoutRequests(authenticatedUserId) });
  }

  if (path === "/api/commerce/creator/payout-request" && request.method === "POST") {
    const authenticatedUserId = await getAuthenticatedUserId(request);
    if (!authenticatedUserId) return json({ ok: false, error: "Sign in before requesting a payout." }, 401);
    try {
      const body = await request.json();
      if (body.payoutType !== "referral") return json({ ok: false, error: "Choose XPRIME referral earnings." }, 400);
      return json({ ok: true, request: await createCreatorPayoutRequest(authenticatedUserId, body.payoutType) });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Payout request could not be submitted." }, 400);
    }
  }

  if (path === "/api/admin/commerce/creator-payout-requests" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    return json({ ok: true, requests: await getAdminCreatorPayoutRequests() });
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
    const [overview, payoutRequests] = await Promise.all([getAdminCommerceOverview(), getAdminCreatorPayoutRequests()]);
    return json({ ok: true, overview: { ...overview, creatorPayoutRequests: payoutRequests } });
  }

  if (path === "/api/admin/commerce/mele-health" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    const health = await getMeleHealth();
    return json({ ok: true, health });
  }

  if (path === "/api/admin/commerce/mele-plans" && request.method === "GET") {
    const session = verifyAdminSession(request);
    if (!session.valid) return json({ ok: false, error: session.error || "Unauthorized." }, 401);
    try {
      // Force a live provider request using MELE_DATA_API_KEY; never return the
      // public Xora catalogue or a cached plan list for a real purchase test.
      const plans = await getMelePlans(true);
      return json({ ok: true, plans, source: "mele-live" });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not load MELE live plans." }, 502);
    }
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
