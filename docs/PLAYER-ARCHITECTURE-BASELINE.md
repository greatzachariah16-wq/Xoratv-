# XoraTV Player Architecture — Existing Baseline

This document records the player behaviour that existed on `main` before the hybrid direct/proxy playback work. It is intentionally separate from the implementation notes in `HYBRID-DIRECT-PROXY-PLAYBACK.md`.

## Existing implementation (baseline)

| Capability | Baseline status | Notes |
|---|---|---|
| Shared React Live TV player route | Implemented | `src/routes/tv.tsx` controls channel selection and native-player lifecycle. |
| Android native LibVLC player | Implemented | `XoraVlcPlugin.java` owns the native media player and video surface. |
| Native player reuse on channel switch | Implemented | Existing MediaPlayer and attached surface are reused. |
| Channel URL and provider resolution | Implemented | Backend resolves IPTV Nexus/IPTV-org stream sources. |
| Render HLS reverse proxy | Implemented | `/api/tv/stream` fetches upstream playlists and media resources. |
| HLS playlist rewriting | Implemented | Relative/absolute variant, segment and URI attribute URLs are rewritten to the proxy. |
| HTTP Range relay | Implemented | Range requests and relevant response headers are forwarded. |
| Upstream User-Agent / Referer injection | Implemented server-side | The proxy applies provider playback metadata. |
| Native retry candidates | Partially implemented | Ranked Nexus alternatives are exposed through proxy attempt URLs. |
| Startup timeout | Implemented | 15 seconds. |
| Buffering indicator delay | Implemented | 400 ms. |
| Buffering watchdog | Implemented | 15 seconds, with one restart before error probing. |
| Automatic retry backoff | Implemented | 1s, 2s, 4s schedule, up to three scheduled retries. |
| Network callback and offline recovery | Implemented | Uses Android INTERNET capability; does not require VALIDATED. |
| Background/resume, orientation and PiP | Implemented | Existing lifecycle and presentation handling. |
| Direct origin/CDN HLS delivery from LibVLC | Not implemented in baseline | Baseline sent the stream through Render's proxy. |
| Direct-to-proxy fallback | Not implemented in baseline | Baseline had proxy URL candidates only. |
| Channel-specific proxy preference memory | Not implemented in baseline | No feedback-driven preference cache. |

## Baseline playback flow

```text
React Live TV route
       |
       v
/api/tv/stream (Render)
       |
       v
Provider origin / CDN
       |
       v
Render rewrites HLS playlist and relays segments
       |
       v
Android LibVLC
```

## Files defining the baseline

- `src/routes/tv.tsx`
- `src/lib/native-vlc.ts`
- `src/server.ts`
- `mobile/capacitor-android/splash/java/io/xora/app/XoraVlcPlugin.java`

This baseline is historical documentation. The hybrid implementation is documented separately and is being developed on its own feature branch; it does not rewrite this record.
