# XoraTV Live TV: direct playback and XMLTV EPG

This change is isolated to the /tv Live TV route. Xsports, XoraKids, X-Series, Shorts and their playback paths are not redirected to the new transport.

## Direct LibVLC experiment

Live TV sends the channel's original HTTPS streamUrl to the existing XoraVlc Capacitor plugin with directOnly: true. In this mode the Android plugin does not create a LocalHlsProxy session, does not prebuffer through the local rolling cache and does not add a proxy fallback candidate. If the provider rejects direct access, the channel reports a playback error. Existing plugin behaviour remains the default for every caller that does not set directOnly.

The LibVLC engine and native player surface remain the same. The plugin's transport selection was extended only to allow the controlled direct-only test. M3U User-Agent and Referer metadata are passed as LibVLC HTTP options when present.

## EPG source

Open Live TV → Programme guide → EPG source settings. Enter the XMLTV URL from the provider. An optional proxy URL must contain the literal {url} placeholder, for example:

    https://your-proxy.example/fetch?url={url}

The app requests /api/tv/epg-source on the same XoraTV origin. The server follows redirects and streams the upstream response body to the WebView, preserving ETag and Last-Modified. This avoids WebView CORS and avoids buffering the whole guide in a JavaScript string. The endpoint rejects local/private network addresses and only accepts HTTP(S) URLs.

No additional Capacitor plugin is required. The current Capacitor core and custom XoraVlc plugin are reused. Capacitor's native HTTP bridge is intentionally not used for the XML body because a normal bridge response materialises the body before JavaScript receives it; that is unsuitable for 50–300 MB XMLTV files. The same-origin streaming endpoint is the configurable proxy path.

The XMLTV parser uses DecompressionStream("gzip") for .gz sources, reads UTF-8 chunks, writes programme batches to IndexedDB, and retains the two-hour-past / 48-hour-future window. The device's local timezone is used only for display and local calendar-day boundaries; XMLTV offsets are converted to UTC epoch milliseconds first.

## Storage

IndexedDB database: xoratv-epg
- channels: XMLTV channel records
- programmes: programmes, with channelId, start, stop, and compound channelStart indexes
- meta: source URL, validators, match results and refresh timestamps
- mappings: manual channel-to-EPG overrides

The guide refreshes every six hours and when the app returns to the foreground. Expired programmes are deleted after a successful update. Nothing is stored in localStorage.

## Matching diagnostics

Download the M3U and XMLTV files, then run:

    node scripts/check-epg-match.mjs ./provider.m3u ./guide.xml.gz

The report prints the number of M3U entries with tvg-id, XMLTV channel IDs found, exact matches and missing IDs. Name-normalized matching and manual overrides are handled in the app. A missing tvg-id is not counted as an exact match.

## Country ranking

Live TV sorts Nigeria first, other African countries next, then the United States, United Kingdom and remaining countries. Within a country group, higher provider health/quality score ranks first, then channel name. The existing country filter and country flag remain visible.

## Test boundary

The repository can validate implementation and build compatibility. Real source reachability, provider-specific headers, exact ID coverage, EPG content freshness and direct stream success must be verified with the actual provider M3U and XMLTV URL. Do not treat a successful app build as proof that a provider's stream or EPG is reachable.
