# X-Series catalogue API

The X-Series catalogue uses Cloudflare D1 (XORATV_XSERIES_DB) for catalogue records and TMDB only for selected title metadata and artwork. No stream URL, video URL, supplier, or playback field is stored or returned.

## Public
- GET /api/xtv-series/status — database connection and record counts.
- GET /api/xtv-series/items?genre=Drama&page=1&limit=1000 — published catalogue items only.

## Administrator (existing Xora admin session required)
- GET /api/xtv-series/admin/tmdb-search?q=title&type=all|movie|tv — search TMDB.
- POST /api/xtv-series/admin/import — body: {"tmdbId":123,"mediaType":"movie","category":"Drama"}; imports selected metadata as an unpublished draft.
- GET /api/xtv-series/admin/titles — list imported titles and publication state.
- POST /api/xtv-series/admin/titles/:id/publish — publish a title.
- POST /api/xtv-series/admin/titles/:id/unpublish — unpublish a title.
- DELETE /api/xtv-series/admin/titles/:id — delete a title.

The public X-Series screen reads this API. Watch actions remain unavailable until a movie supplier is connected.
