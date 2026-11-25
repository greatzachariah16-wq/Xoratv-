# XoraTV Cloudflare backend (staging)

This directory is the first, isolated step in moving suitable XoraTV backend APIs from Render to Cloudflare Workers.

## Current scope

- `GET /health` and `GET /api/health`: non-mutating Worker health checks.
- `OPTIONS`: exact-origin CORS preflight when the origin is listed in `ALLOWED_ORIGINS`.
- All other paths return a JSON 404. No production API is redirected here.

## Why this is staged

The current Render backend is not a drop-in Workers deployment. The existing server entry imports Node.js filesystem and child-process APIs, reads/writes local media cache files, invokes FFmpeg/Python subprocesses, and starts in-process interval schedulers. Those responsibilities must remain on Render until separately redesigned for Cloudflare-compatible services.

The migration will port API routes individually after reviewing each route's authentication, Firebase/Supabase access, secrets, and side effects. Existing production traffic, Render service configuration, media playback, and the Android app are unchanged by this scaffold.

## Browser origins

Set the Worker variable `ALLOWED_ORIGINS` to a comma-separated list of exact approved origins before enabling browser calls. The default is the current XoraTV Render origin. Do not use wildcard CORS for authenticated or state-changing endpoints.

## First migration candidates

Choose routes that are stateless or use supported fetch-based integrations first. Do not move filesystem-backed uploads, FFmpeg verification, stream cache, or background schedulers as-is. Those need separate designs and tests.
