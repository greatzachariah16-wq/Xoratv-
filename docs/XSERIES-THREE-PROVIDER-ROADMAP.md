# XSeries five-provider playback integration

Status: provider adapters and the Cloudflare playback endpoint are implemented on `cloudflare-backend-staging`; deployment and live playback verification are pending.

## Provider order

1. CinePro Foundation — primary; requires a reachable HTTPS CinePro Core instance configured as the Worker variable `CINEPRO_API_BASE_URL`.
2. VidSrc.sh — secondary; checks its documented JSON availability endpoint, then uses its TMDB embed URL.
3. 2Embed.cc — third; uses its documented TMDB movie/episode iframe URL.
4. CineSrc — fourth; uses its documented TMDB movie/episode iframe URL.
5. BingeAPI — fifth; uses its documented TMDB movie/episode iframe URL.

TMDB remains the catalogue metadata and identifier source. It is not a playback source.

## Implemented Cloudflare architecture

- Cloudflare entrypoint: `src/server.cloudflare.ts`
- XSeries API controller: `src/server/xtv-series-d1-controller.ts`
- Provider registry and fallback resolver: `src/server/xseries-provider-manager.ts`
- D1 binding: `XORATV_XSERIES_DB`
- D1 catalogue table: `xseries_titles`
- Playback endpoint: `GET /api/xtv-series/stream?id=movie_<tmdbId>`
- Optional TV episode parameters: `id=tv_<tmdbId>&season=<n>&episode=<n>`
- Existing Watch page consumes the endpoint and displays the selected provider.

## Playback behavior

- CinePro Core returns OMSS `sources[]`; the resolver normalizes HLS, DASH and progressive-file sources.
- VidSrc.sh is checked through its documented `/info/movie/{id}.json` or `/info/tv/{id}/{season}/{episode}.json` endpoint.
- 2Embed.cc, CineSrc and BingeAPI return iframe embed URLs, not direct media URLs. They are checked for endpoint reachability and passed to XoraTV's existing provider-embed player.
- The resolver tries providers in priority order and continues after a no-match or provider outage. Each attempt is included in the endpoint diagnostics.
- Embed URLs are never passed to LibVLC as if they were HLS or MP4 streams.
- Provider requests use bounded timeouts. Only HTTPS provider and playback URLs are accepted.

## Required CinePro configuration

CinePro Core is a self-hosted service. XoraTV does not currently have a configured CinePro Core host in the Worker environment. Set the Cloudflare Worker variable/secret `CINEPRO_API_BASE_URL` to the publicly reachable HTTPS base URL of the deployed CinePro Core instance. Its `PUBLIC_URL` must be configured so returned proxy URLs are externally reachable. Until then, the resolver skips CinePro and continues to VidSrc.sh.

## Verification still required

1. Confirm the Cloudflare build completes successfully.
2. Configure `CINEPRO_API_BASE_URL` after the Core host is available.
3. Test the live Worker endpoint with a published movie ID.
4. Verify that the returned embed URL opens in the Watch page and that a direct CinePro source plays correctly.
5. Verify provider fallback when each earlier provider returns unavailable.
6. Verify the existing TMDB catalogue, search, manual imports and other XoraTV sections remain unchanged.

No catalogue rows or artwork are modified by this integration. No Render dependency or APK rebuild is introduced.
