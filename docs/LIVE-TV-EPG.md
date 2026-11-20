# XoraTV Live TV XMLTV EPG

The Live TV guide is implemented in the existing TanStack Start / React 19 / TypeScript application. It does not replace LibVLC or the existing channel playback plugin.

## Data flow

1. The server's existing IPTV M3U loader reads tvg-id, tvg-name, tvg-logo, group-title, country metadata and the M3U header's url-tvg / x-tvg-url.
2. /api/tv/channels returns the selected channel catalogue and the discovered XMLTV URL. The existing Nexus XMLTV URL is used only when the playlist header has no guide URL.
3. Android's local XoraEpg Capacitor plugin downloads the XMLTV to the app cache using OkHttp. It follows redirects, sends If-None-Match / If-Modified-Since, detects gzip by its file signature, and expands gzip to a temporary disk file without holding the guide in RAM. A configured proxy URL is attempted only if the direct request fails.
4. The WebView reads the native file in 48 KB chunks. The XMLTV parser processes complete channel/programme blocks incrementally and retains only programmes overlapping the window from two hours ago through 48 hours ahead.
5. IndexedDB stores XMLTV channels, programmes, source metadata and manual channel mappings. Programme writes are batched; expired rows are removed after each update.
6. Channel matching uses exact tvg-id first, then a unique normalized channel name. Ambiguous or unmatched channels are shown in the guide's Channel matching section for manual mapping.

## Configuration

Optional build-time environment variables:

- VITE_XORA_EPG_URL: manually supplied XMLTV URL. The M3U header URL takes precedence.
- VITE_XORA_EPG_PROXY_URL: optional proxy URL. Use {url} as a placeholder, for example https://proxy.example/epg?url={url}. If no placeholder is present, the encoded source URL is appended as a url query parameter.

The app already includes @capacitor/core and OkHttp 4.12.0 in the Android shell setup. XoraEpgPlugin.java is a local Capacitor plugin registered by MainActivity and copied into the generated Android project by scripts/apply-xora-android.mjs. No additional npm plugin is required.

After pulling the changes, regenerate/sync the Android project and build:

    npm install
    npm run cap:sync:android
    npm run android:debug

The production app uses the existing remote Render website inside Capacitor, so native plugin changes require a rebuilt APK. Web-only UI changes can ship with the website, but native EPG download support requires the APK containing XoraEpgPlugin.

## EPG match diagnostic

Run this on a computer with Node.js after saving the provider playlist and XMLTV file:

    node scripts/check-epg-match.mjs ./channels.m3u ./guide.xml.gz

It prints unique M3U tvg-id values, XMLTV channel IDs, exact matches, missing IDs and match rate. It streams .xml.gz input instead of expanding the entire guide into memory.

## UI and API

- Each Live TV channel row shows its current programme, progress and next programme.
- The selected channel guide has Now / Next, Full day and a virtualized Timeline view.
- Programme times are stored as UTC epoch milliseconds and formatted with the device's local timezone.
- getNowAndNext, getDayGuide, getGridWindow and getProgress are exported from src/lib/epg/epg-api.ts.
- refreshEpg({ force }) supports conditional updates and a forced refresh. Refresh runs every six hours and on app resume/visibility restoration.
- Xtream Codes is intentionally not implemented yet; the EPG API is separated so an Xtream provider can be added later.

## Validation still required with provider files and a device

The repository cannot prove that a private provider playlist and guide match until those files/URLs are supplied. Verify the ID match report, direct/proxy reachability, redirects, gzip, conditional 304 responses, local-time/DST display, duplicate/overlap handling, unmatched-channel mapping, IndexedDB storage and performance on a low-memory Android phone before declaring the EPG production-ready.

The Live TV LibVLC playback path is deliberately unchanged in this EPG change.


Implementation note: Android downloads are streamed to the app cache and read in 48 KB blocks; no whole-guide JavaScript buffer or localStorage is used.

The native bridge uses bounded 256 KB reads to reduce bridge-call overhead while keeping memory use controlled.

When the configured XMLTV source changes, the previous cached guide rows are cleared after the new file has downloaded successfully; validators are never reused across different source URLs.
