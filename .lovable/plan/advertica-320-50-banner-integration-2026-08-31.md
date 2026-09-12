# Advertica 320×50 Banner Integration

## Goal

Make Advertica the only ad network in Xora: one reusable React-safe banner component, mounted once at the top of every page, using the exact publisher code provided. No other functionality changes.

## Current state (verified)

- A full codebase search found **no existing ad-network code** — no A-ADS, Adsterra, popunder, VAST/preroll, ad placeholders, refresh timers, or ad script loaders remain. Cleanup step is already satisfied; nothing to remove.
- The fixed `VideoPlayer` is ad-free and will not be touched.
- All content routes (`/`, `/shorts`, `/learn`, `/video/:id`, `/profile/:username`, `/search`, `/notifications`, `/create`, `/admin`) render inside the shared `AppShell` layout, so a single mount in `AppShell` puts the banner at the top of every view. Only the standalone `/auth` screen does not use `AppShell`.

## Changes

### 1. New component: `src/components/xora/AdverticaBanner.tsx`

React-safe integration (React owns the container, Advertica owns the `<ins>`/iframe inside it):

- Renders a fixed 320×50 container: `width: 320px; height: 50px; margin: 0 auto`, `overflow: hidden`, `max-width: 100%` — centered, native size, never stretched, never causes horizontal scroll.
- On mount (once, guarded against React StrictMode double-effects):
  1. `document.createElement("ins")` with the **exact** publisher attributes: `class="v7ed5decc00"`, `data-width="320"`, `data-height="50"`, `data-domain="//data527.click"`, `data-affquery="/ca12d9f8b146314924fe/7ed5decc00/?placementName=default"`, inline `width: 320px; height: 50px`.
  2. Appends it into the ref'd host div that React never re-renders into (no JSX children), so Advertica replacing `<ins>` with its iframe cannot conflict with React's DOM.
  3. Loads `//data527.click/js/responsive.js` (async) via a **module-level singleton**: checks for an existing tagged script and caches the load promise, so SPA navigation never injects duplicate scripts.
  4. After the script loads, calls the real initializer `window.affilistStart()`. No invented APIs, no `setInterval`, no refresh timers.
- On unmount: clears the host div, so navigating between routes never leaves uncontrolled duplicate ad elements — each mount creates exactly one fresh `<ins>` per slot.
- No fake placeholders: if Advertica returns no creative (its known frequency/cookie behavior), the slot simply stays empty and the app works normally.

### 2. Mount in shared layout: `src/components/xora/AppShell.tsx`

- Render `<AdverticaBanner />` as the first element inside the centered `<main>` content container, above `{children}`, with `mb-5` spacing — this places the banner at the top of every AppShell page, visually separate from all content and nowhere near video controls (the player lives inside feed cards below).

### 3. Auth screen: `src/routes/auth.tsx`

- Add the same `<AdverticaBanner />` above the auth card so the banner appears at the top of this standalone view too (one line, same component — no duplication of ad code).

### Nothing else changes

No edits to the video player, feeds, routing, auth logic, database, uploads, creator system, styles, or UI design.

## Verification (after implementation)

1. Typecheck passes; no console errors.
2. Playwright (desktop 1280px and mobile 360px viewports): banner container is 320×50, centered, page has no horizontal overflow.
3. Confirm in the DOM: exactly one `ins.v7ed5decc00` with the exact `data-affquery`; exactly one `responsive.js` script tag; `window.affilistStart` called after load.
4. Navigate `/ → /shorts → /learn → /video/:id`: still exactly one ad slot per page, no accumulating scripts/iframes.
5. Video player regression check: play/pause/seek/mute/fullscreen still work on a feed video.
6. Note on fill: a fresh browser/profile may show a real creative while a repeat visit shows none — that is Advertica's own frequency/cookie behavior (confirmed working in prior real-device tests), not an integration failure, and will not be "fixed" by bypassing it.
