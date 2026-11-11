# XoraTV Hybrid Direct + Proxy Playback

> Historical architecture note for PR #251. The on-device local HLS proxy in PR #252 supersedes direct LibVLC-to-provider playback for Android.

## Separation from existing player work

The pre-existing architecture is recorded in [PLAYER-ARCHITECTURE-BASELINE.md](./PLAYER-ARCHITECTURE-BASELINE.md). This feature is a separate incremental change on branch `feat/hybrid-direct-proxy-playback`.

## Intended runtime flow

```text
React Live TV route
       |
       v
/api/tv/stream?resolve=1
       |
       +---- direct candidate(s) + UA/Referer headers
       |                  |
       |                  v
       |             Android LibVLC
       |                  |
       |             fatal error / timeout
       |                  |
       +---- proxy fallback URL <---+
                          |
                          v
                 Render /api/tv/stream
                          |
                          v
                   Provider origin
```

## Implementation added on this branch

- Adds a resolver response to `GET /api/tv/stream?resolve=1`.
- Returns ranked HTTPS origin candidates and the per-candidate User-Agent/Referer metadata.
- Returns the existing proxy URL and alternate proxy-attempt URLs as fallback candidates.
- Keeps known special wrestling sources on the proxy path because their current configuration requires the proxy-specific playback behaviour.
- Adds candidate/header handling to the Capacitor bridge and LibVLC plugin.
- Applies `:http-user-agent` and `:http-referrer` to direct LibVLC media before playback.
- Tries subsequent direct candidates first, then the proxy fallback candidates.
- Keeps the existing player instance, decoder fallback, startup timeout, buffering watchdog, retry backoff, network callback, lifecycle, orientation and PiP behaviour.
- Reports transport transitions to React. When a channel falls back to proxy, React posts a short-lived channel preference to the backend (15 minutes) so later resolution can start on the proxy for that channel.
- Manual retry resets the stream index to the first (preferred direct) candidate.

## Important boundaries

- The browser/HLS.js playback path is not changed.
- The existing proxy playlist rewriting and Range relay remain in place.
- No local on-device HLS proxy or segment cache is introduced.
- This branch is not merged or deployed by the act of creating it. Native Android changes require a newly built APK.

## Verification still required

Before merging:
1. Run TypeScript, lint and production build checks.
2. Run the Android Gradle build.
3. Test at least one direct-success channel and one forced-proxy channel on the Honor 8X.
4. Confirm Render request volume and egress decrease for direct-success channels.
5. Verify direct 403/451, timeout and connection-reset failures advance to proxy without manual intervention.
6. Confirm manual retry begins with the direct candidate.
