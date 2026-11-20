# XoraTV On-Device Local HLS Proxy and Rolling Buffer

## Android playback architecture

Live TV, XSports and Xora Kids use the same Android \`XoraVlcPlugin\`, \`LocalHlsProxy\` and \`LocalHlsBuffer\` path. The page supplies a secure Render stream URL; Android creates a local session and LibVLC receives only loopback URLs shaped like:

\`http://127.0.0.1:8787/play/{sessionId}\`

If port 8787 is occupied, the native proxy tries ports 8788 through 8797. It binds explicitly to 127.0.0.1 and is not exposed on the device LAN.

## Android rolling segment cache with immediate startup

- On channel selection, Android fetches the HLS playlist and resolves the selected media variant.
- It downloads complete HLS media segments into that app's private cache directory.
- Playback can start as soon as the first complete media segment is stored locally; it no longer waits for a 60-second prebuffer.
- The generated live playlist starts from the oldest complete segment currently cached, without a forced 60-second seek behind the live edge, then refreshes as new segments arrive.
- The cache remains active during playback, keeps a rolling window of up to 5 minutes and is capped at 256 MB; older segments are removed as newer segments are saved.
- Startup status reports segment caching rather than a 60-second countdown.
- Recent segment download speed is compared with each segment's playback duration. A sustained rate below real time shows “Slow internet connection” during startup or playback.
- If the first media segment cannot be downloaded within 3 minutes, startup reports a slow connection.

The segment cache is local to Android. Render still relays the stream for these proxy-routed pages, so this change does not eliminate Render transfer; it makes the player's playback read from locally stored segments after they have been fetched.

## Local media responsibilities

- Resolve and fetch HTTP or HTTPS HLS origins through the stream URL and keep LibVLC loopback-only.
- Fetch playlists and segments with the resolver-supplied User-Agent, Referer and supported request headers.
- Select a compatible media variant from master playlists (preferring a variant at or below 4.5 Mbps, otherwise the lowest available).
- Resolve relative playlist references against the final upstream URL after redirects.
- Rewrite media-segment URLs to local resource URLs, while preserving encryption-key and initialization-map references.
- Support complete segment files, explicit and continuing byte ranges, and local byte-range responses.
- Keep channel sessions in a concurrent map; sessions expire after 45 minutes of inactivity and are cleared on channel change, player close or plugin destruction.
- Store segments under the Android app cache directory, never on Render storage.
- Log only session IDs and upstream hostnames, never complete signed URLs.

## Transport reporting

- \`proxy\`: the Android local proxy fetches the supplied Render media-relay URL.
- \`local\`: the Android local proxy fetches a direct provider candidate supplied by the resolver.

Both modes use the same Android segment cache and LibVLC loopback URL. Live TV, XSports and Xora Kids use the Render stream route for consistent provider IP handling.

## Android build integration

\`scripts/apply-xora-android.mjs\` copies \`LocalHlsProxy.java\` and \`LocalHlsBuffer.java\` into the generated Android app and adds NanoHTTPD 2.3.1. Native Android changes require a fresh APK; a Render website deployment alone cannot update an installed APK.

## Device verification required

Before merging, test on the Honor 8X:
1. Confirm playback starts after the first complete segment is cached, without waiting for 60 seconds.
2. Confirm the rolling segment cache continues saving new segments during playback without changing the existing player controls.
3. Confirm the generated playlist stays current while new segments arrive.
4. Test encrypted HLS with \`EXT-X-KEY\` and \`EXT-X-MAP\`.
5. Test segments using \`EXT-X-BYTERANGE\`, including implicit continuation offsets.
6. Switch channels repeatedly and close/reopen the player to check cache and session cleanup.
7. Test weak network throughput and confirm the slow-connection warning appears.
8. Confirm all cached segment files remain under the Android app cache directory.
