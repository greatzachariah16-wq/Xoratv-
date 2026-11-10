# XoraTV On-Device Local HLS Proxy

## Architecture

The Android player resolves channel candidates through Render, then creates a short-lived local session for each upstream candidate. LibVLC receives only URLs shaped like:

`http://127.0.0.1:8787/play/{sessionId}`

If port 8787 is occupied, the native proxy tries ports 8788 through 8797. The server binds explicitly to 127.0.0.1 and is not exposed on the device LAN.

## Local media responsibilities

- Fetch HLS playlists with resolver-supplied User-Agent, Referer and other supported headers.
- Resolve relative playlist references against the final upstream URL after redirects.
- Rewrite bare media/variant URI lines and URI attributes in HLS tags, including key, map, media and rendition references.
- Relay segments, initialization maps and encryption keys as streams rather than loading media objects into memory.
- Forward Range requests and Content-Range / Accept-Ranges response metadata.
- Keep multiple session IDs in a concurrent map; sessions expire after 45 minutes and are cleared on channel change, player close or plugin destruction.
- Log only session IDs and upstream hostnames, never complete signed URLs.

## Transport reporting

- `local`: provider media is fetched by the phone through LocalHlsProxy.
- `proxy`: the local proxy is relaying the emergency Render media-proxy URL. LibVLC still talks only to loopback.

## Render boundary

Render remains responsible for candidate resolution and playback feedback. The old `/api/tv/stream` media relay remains available as the last-resort fallback candidate. Normal direct candidate playback no longer sends playlist or segment traffic through Render.

## Android build integration

`scripts/apply-xora-android.mjs` copies `LocalHlsProxy.java` into the generated Android app and adds NanoHTTPD 2.3.1. Native Android changes require a fresh APK; a Render website deployment alone cannot update an installed APK.

## Device verification required

Before merging, test on the Honor 8X:
1. Confirm the LibVLC media URI is always loopback.
2. Play a direct HLS channel with relative variants and segments.
3. Play a channel requiring Referer/User-Agent headers.
4. Play encrypted HLS with EXT-X-KEY and EXT-X-MAP.
5. Seek and confirm Range/206 handling.
6. Switch channels repeatedly and close/reopen the player to check session cleanup and port reuse.
7. Force a provider failure and confirm the local proxy advances to the Render emergency fallback.
8. Compare Render request volume before and after local playback.
