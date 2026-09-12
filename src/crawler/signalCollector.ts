/**
 * 7. Quality/Interest Signal Collection Component
 *
 * Collects publicly available rating, view, and engagement signals.
 *
 * CRITICAL RULE:
 * Quality and interest signals must ONLY be collected at this stage.
 * They are NOT used to rank, score, or prioritize content yet.
 */

import type { QualityInterestSignals, RatingInfo, EngagementInfo } from "./types.ts";

export class SignalCollector {
  /**
   * Normalizes raw metrics into an unranked quality/interest signals structure.
   */
  public collectSignals(
    rating?: RatingInfo | undefined,
    engagement?: EngagementInfo | undefined,
    extraMetrics?: { reviewCount?: number; subscribers?: number } | undefined,
  ): QualityInterestSignals {
    let engagementRatio: number | undefined = undefined;

    if (engagement?.views && engagement?.likes) {
      engagementRatio = engagement.likes / Math.max(1, engagement.views);
    }

    return {
      viewCount: engagement?.views,
      likeCount: engagement?.likes,
      commentCount: engagement?.comments,
      ratingScore: rating?.score,
      ratingScale: rating?.scale,
      reviewCount: extraMetrics?.reviewCount ?? rating?.voteCount,
      subscriberFollowerCount: extraMetrics?.subscribers,
      engagementRatio,
      collectedAt: new Date().toISOString(),
    };
  }
}
