# XoraTV Cloudflare Serverless Migration Audit

Status: staging audit; production remains on Render. This document records verified source-code findings and the migration sequence. It is not a claim that the migration is complete.

## Target

Move the complete TanStack Start application (all existing routes/pages and server APIs) to Cloudflare Workers using the official `@cloudflare/vite-plugin`. Keep the existing app UI and route definitions. Do not migrate the IPTV stream proxy: Android LibVLC plays direct provider stream URLs locally.

Keep existing data and media systems during the hosting migration:
- Firebase Realtime Database remains the current application data store.
- Existing Cloudinary uploads and media URLs remain in place.
- Do not create or require an R2 bucket or payment card for this migration.
- Supabase integration remains as currently configured; do not silently change auth or database ownership.

## Verified current application

- Framework: TanStack Start 1.168.32, React 19, Vite 8.1.5.
- Current Vite configuration imports `@lovable.dev/vite-tanstack-config`; its comments say it injects TanStack Start, React, Tailwind, aliases, environment injection, and a Nitro adapter targeting Node/Render.
- Current deployment is Nitro `render-com`; package start command launches `.output/server/index.mjs`.
- `src/server.ts` is a custom Node server entrypoint and imports `node:child_process`, `node:fs`, `node:path`, `node:crypto`, and `node:stream`.
- It starts recurring schedulers during module initialization (discovery, X-Series discovery, Shorts verification, and IPFS discovery).
- It implements local filesystem media reads/writes and range streaming.
- It includes a local upload fallback, Cloudinary signature endpoint, Firebase RTDB calls, content discovery, creator commerce, offers, rewards, wallet, campaigns, admin, chat purge, and catalog endpoints.
- Server modules include admin auth, campaigns, commerce, media upload, CPX rewards/live TV, engagement, offerwall, wallet, X-Series, discovery runners, and stream proxy.
- The repository includes Firebase rules/config, Supabase config, Cloudinary integration and a lockfile.

## Worker incompatibilities to remove or replace

1. Replace the Lovable/Nitro Render adapter with the Cloudflare Vite plugin while preserving the TanStack Start/React/Tailwind build pipeline. Verify the helper package's plugin injection before editing; avoid loading Nitro and Cloudflare adapters together.
2. Replace the custom Node server entrypoint with the TanStack Start Worker entrypoint plus only Worker-compatible request hooks.
3. Remove local filesystem media serving and disk upload fallback from the Cloudflare runtime. Continue existing Cloudinary signed/direct upload flows.
4. Do not import or invoke the IPTV stream proxy in the Cloudflare app. Preserve direct stream URLs for local LibVLC playback.
5. Move scheduled discovery and verification from startup timers to Cloudflare Cron Triggers and/or Queues. Preserve opt-in/disabled behavior and ensure jobs are idempotent before enabling schedules.
6. Audit all imported server modules for Node-only packages and process.env usage; convert configuration to Worker bindings/secrets and Web Crypto where necessary.
7. Preserve Firebase RTDB semantics and authorization. Do not expose service-account secrets or privileged admin operations to the browser.
8. Keep API contracts and existing route URLs stable; migrate by feature group and test each group.

## Migration sequence

- [ ] Cloudflare Vite adapter and Workers config on isolated branch.
- [ ] Worker-compatible TanStack Start SSR build and preview.
- [ ] Request context, CORS, environment bindings and secret handling.
- [ ] Core Firebase-backed session/profile/feed/engagement APIs.
- [ ] Creator, offers, rewards, wallet, campaigns and admin APIs.
- [ ] X-Series catalog and approved media APIs.
- [ ] Cloudinary signed upload and upload authorization.
- [ ] Cron/Queue replacements for background jobs.
- [ ] Remove obsolete proxy and local-disk media endpoints from Cloudflare path.
- [ ] Build checks, route smoke tests, Android WebView/Capacitor checks, and API regression tests.
- [ ] Only after acceptance, plan production domain/API cutover. Keep Render available for rollback until then.

## Safety rules

- Never change the live Render service or production DNS during staging.
- Never merge an unbuilt or untested migration.
- Never replace real feature APIs with success-shaped placeholder handlers.
- Never claim the whole app is migrated merely because the IPTV catalogue Worker is deployed.

## Additional Node-runtime findings from repository search

The Node-only surface extends beyond `src/server.ts`:
- `src/routes/api.source-ipfs.ts`, `api.source-ipfs-index.ts`, `api.source-ipfs-seed-history.ts`, and `api.source-ipfs-search.ts` spawn Python scripts directly.
- `src/server/shorts-verification.ts` uses child processes for media checks.
- `src/server/admin-auth.ts` imports Node filesystem and crypto APIs for audit/security state.
- `src/server/stream-proxy.ts` imports filesystem, OS, streams, child processes and utilities; it is intentionally excluded from the Cloudflare runtime because playback is local in LibVLC.
- `src/routes/api.profile.ts`, `api.subscriptions.ts`, `api.chat.ts`, and `src/server/session-auth.ts` use Node crypto and `process.env` for Supabase session access. These need Web Crypto and Worker environment bindings (or a compatible audited library).
- The project includes Puppeteer, Chromium and FFmpeg dependencies. They must not be imported into the Worker bundle. Browser automation/media verification needs a separate compatible execution path or to remain disabled; do not pretend Workers can run these binaries.

This means the migration must include route-level and transitive-import audits, not just changing the deployment adapter.

## Important architecture clarification from the full server entrypoint

The app's backend is not only a collection of TanStack file routes. `src/server.ts` is a custom request dispatcher that intercepts requests before the TanStack SSR fallback. It owns multiple application API contracts directly. Replacing it with the stock Start entrypoint would silently remove those APIs, so that shortcut is prohibited.

The dispatcher currently includes, among others:
- TV catalogue, playback resolution, playback feedback and EPG.
- XTV Series catalogue, playback resolution and discovery run.
- Discovery run and YouTube/Vimeo provider search.
- Cloudinary/media upload and storage bridge routes.
- Creator commerce, campaigns, offerwall, survey wallet, CPX rewards and live TV, admin and X-Series handlers imported near the top of the entrypoint.
- Local media file reads and multipart upload fallback.

A safe Cloudflare migration therefore needs a Worker-compatible request dispatcher that preserves each supported route's response contract, then falls through to the TanStack Start SSR handler. Route handlers should be extracted into independent modules with explicit Worker `env`/execution context parameters. Node-only modules must not be imported by the Worker graph.

The existing `/api/tv/stream` route is a streaming proxy and is excluded from the new architecture as requested; direct stream resolution/catalogue APIs remain where needed by the app and local LibVLC. The local upload/media-disk routes must be replaced by the existing Cloudinary signed upload path, not by a new R2 dependency.

## Required next technical milestone

Before switching the default Vite config, build an isolated Worker entrypoint and test that it preserves the current dispatcher route inventory. Then move the app's Vite adapter to Cloudflare and validate the generated SSR build. This avoids accidentally deploying only the frontend while dropping backend routes.
