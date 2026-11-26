# XoraTV Cloudflare edge backend

This project is being migrated from the Render-hosted Node server to Cloudflare in stages. The live Worker is `xoratv-edge-api` at:

`https://xoratv-edge-api.ericgreat668.workers.dev`

## Deployed routes

- `GET /health` and `GET /api/health`: Worker health.
- `GET /api/tv/channels`: IPTV-org M3U catalogue. Supports `query`, `country`, `category`, `limit`, and `platform` (platform is currently ignored because stream playback happens in the XoraTV app through LibVLC).
- `OPTIONS`: CORS preflight.

The catalogue returns direct stream URLs for the native app's LibVLC player. It does not proxy, relay, transcode, or download video streams. The app connects to stream providers directly.

## Migration scope

Move XoraTV application pages/static frontend delivery and the APIs those pages require to Cloudflare. Migrate page/API dependencies in small, tested groups. Do not route the application back through the Render streaming proxy.

Keep existing Firebase Realtime Database and Supabase data sources unless an explicit migration is planned. Any Worker access to protected data must use server-side secrets/bindings and preserve the existing authentication and authorization checks.

## Keep out of Workers

- The old streaming proxy and media relay path: not required by XoraTV's local LibVLC playback.
- Node-only filesystem/media-cache code, FFmpeg/Python subprocesses, and in-process Node schedulers until they are deliberately replaced with Cloudflare-compatible designs. These are not prerequisites for the IPTV catalogue Worker.

## Current deployment status

- Worker deployed and workers.dev subdomain enabled.
- No production app API base URL or DNS route has been switched yet.
- Existing Render frontend/server remains the current production origin until the frontend build and remaining APIs are migrated and tested.
- No Render service configuration or production secrets were changed by this Worker deployment.

## Next migration work

1. Port the remaining page APIs (X-Series catalogue, profiles, creator, rewards/wallet, alerts, admin and other routes) after tracing each route's auth and data dependencies.
2. Build and deploy the TanStack Start frontend to Cloudflare Workers/Static Assets using a compatible runtime/build target, then test deep links and Android Capacitor navigation.
3. Update the app's API base URL only after the matching routes are deployed and verified.
4. Remove the old proxy route from the app/backend only after confirming no client still calls it.
