# XSeries three-provider playback architecture

Status: architecture scaffold; provider adapters are not enabled.

## Provider order

1. CinePro Foundation — primary candidate
2. VidSrc.sh — secondary candidate
3. 2Embed.cc — third candidate

TMDB remains the catalogue and metadata source. TMDB IDs are identifiers for matching only; they are not playback URLs.

## Current Cloudflare architecture

- Cloudflare entrypoint: `src/server.cloudflare.ts`
- XSeries API controller: `src/server/xtv-series-d1-controller.ts`
- D1 binding: `XORATV_XSERIES_DB`
- D1 catalogue table: `xseries_titles`
- Existing watch client requests `GET /api/xtv-series/stream?id=...`
- The Cloudflare controller currently implements catalogue, search and admin routes, but does not implement that stream endpoint.

## Target architecture

```
XSeries watch page
       |
GET /api/xtv-series/stream?id=movie_<tmdbId>
       |
Cloudflare XSeries playback controller
       |
TMDB ID -> provider-specific title match
       |
Ordered provider adapter registry
       | 1. CinePro Foundation
       | 2. VidSrc.sh
       | 3. 2Embed.cc
       |
Normalize supported playback result
       |
Existing XoraTV player
```

## Adapter contract

Each adapter must implement the same internal contract:

- Provider ID and display name
- Availability/configuration check
- Lookup by TMDB movie ID (and episode identifiers if series support is later enabled)
- Return a typed result: direct HLS/DASH/file URL, authorized embed URL, or unavailable
- Preserve required playback headers only when the provider's documented integration permits them
- Use bounded request timeouts and response sizes
- Never log tokens, signed URLs, or full playback URLs
- Return a typed failure reason; do not silently claim a source is playable

The resolver tries adapters sequentially in the configured priority order. It advances only for a genuine unavailable/not-found result. Authentication, rate-limit, policy, or provider-server errors are recorded distinctly and must not be disguised as "no match".

## Data model

Keep TMDB metadata separate from provider mappings. A future D1 mapping table should contain:

- `tmdb_id`
- `media_type`
- `provider_id`
- `provider_content_id`
- `match_method` and `match_confidence`
- `last_checked_at`
- `availability_status`

Do not store long-lived signed playback URLs in D1. Resolve them on demand.

## Playback result types

- `direct-hls`: HLS manifest URL
- `direct-dash`: DASH manifest URL
- `direct-file`: supported progressive media URL
- `embed`: provider-authorized iframe/player URL
- `unavailable`: no valid match

The player must not treat an arbitrary web page URL as a direct media stream. Native LibVLC is used only for supported direct media sources; embed results use a compatible web player path.

## Integration gates

An adapter remains disabled until its current API documentation, authentication method, permitted embedding/streaming use, and commercial distribution rights have been verified. Provider credentials belong in Cloudflare Worker secrets, never in frontend code or committed files.

CinePro Foundation's repository license and terms must permit XoraTV's intended commercial use before activation. VidSrc.sh and 2Embed.cc must likewise provide an authorized integration route for the content being distributed.

## Delivery sequence

1. Add the shared adapter contract and provider registry.
2. Add a D1 mapping migration with indexes and no changes to existing catalogue rows.
3. Implement and test one approved adapter at a time in priority order.
4. Add the Cloudflare stream endpoint consumed by the existing watch page.
5. Add deterministic fallback, per-provider diagnostics, and request timeouts.
6. Test movie matching, no-match, provider outage, rate limiting, direct playback, embed playback, and Android/browser behavior.
7. Enable production routing only after all checks pass.

## Non-regression requirements

- Preserve all existing TMDB catalogue rows and artwork.
- Preserve manual imports and existing catalogue/search behavior.
- Do not change Live TV, XSports, XKids, or the shared player outside the XSeries playback path.
- Do not introduce a Render dependency.
- Do not trigger an APK rebuild for server-only changes.
