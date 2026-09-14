# Xora TV

A modern social video streaming web application and PWA powered by Vite, TanStack Start, React 19, TypeScript, Firebase Realtime Database (RTDB), and a Render-hosted media/SSR backend.

## Architecture & Hosting (Render + Firebase Realtime Database)

- **Frontend & SSR Server**: TanStack Start + Nitro built for Node (`preset: render-com`), running on a single unified Render Web Service.
- **Metadata Database**: Firebase Realtime Database (RTDB) is the sole database for all metadata (profiles, posts, feeds, comments, likes, follows, notifications, media index, and crawler candidates). Cloudflare and Firestore are completely removed.
- **Media & File Streaming Origin**: The Render Node server is the sole origin for file uploads and video/poster/avatar streaming with full HTTP `Range` request support (`Accept-Ranges: bytes` / 206 Partial Content).

---

## Deployment on Render

Xora TV runs as a single Render Web Service that hosts both the TanStack Start SSR web application and the media streaming & upload API endpoints.

### 1. Web Service Configuration (`render.yaml`)

```yaml
services:
  - type: web
    name: xoratv
    runtime: node
    plan: free
    branch: main
    buildCommand: npm install && npm run build
    startCommand: node .output/server/index.mjs
    envVars:
      - key: NODE_VERSION
        value: 22
      - key: NITRO_PRESET
        value: render-com
      - key: HOST
        value: 0.0.0.0
      - key: PORT
        value: 10000
      - key: MEDIA_ROOT
        value: ./media
```

### 2. Environment Variables

Configure the following variables in the Render Dashboard under **Environment**:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `NODE_VERSION` | Node.js runtime version | `22` |
| `NITRO_PRESET` | Nitro build preset for Render | `render-com` |
| `HOST` | Bind host | `0.0.0.0` |
| `PORT` | Service port | `10000` |
| `MEDIA_ROOT` | Filesystem directory where media is saved | `./media` |
| `PUBLIC_MEDIA_BASE_URL` | Public streaming base URL | `https://xoratv.onrender.com` |
| `VITE_RENDER_BACKEND_URL`| Render backend base URL for client uploads | `https://xoratv.onrender.com` |
| `VITE_FIREBASE_API_KEY` | Firebase Client API Key | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `xora-tv.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `xora-tv` |
| `VITE_FIREBASE_DATABASE_URL` | Firebase RTDB URL | `https://xora-tv-default-rtdb.firebaseio.com` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | `xora-tv.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID | `977340710920` |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | `1:977340710920:web:...` |
| `FIREBASE_DATABASE_URL` | Server-side Firebase RTDB URL | `https://xora-tv-default-rtdb.firebaseio.com` |
| `FIREBASE_SERVICE_ACCOUNT` | (Optional) Service account JSON for admin access | `{...}` |
| `VITE_YOUTUBE_API_KEY` | YouTube Data API v3 Key for content discovery | `AIzaSy...` |
| `VITE_VIMEO_ACCESS_TOKEN` | Vimeo API Access Token | `e9f...` |
| `VITE_DAILYMOTION_API_KEY` | (Optional) Dailymotion API key (public search works keyless) | `...` |

---

## Content Provider Discovery & Ingestion

Xora TV integrates with three official, free content providers to discover metadata and embed legally authorized videos without storing or re-hosting full video bytes:

1. **YouTube Data API v3**:
   - Searches videos and metadata via official `/v3/search` and `/v3/videos` endpoints.
   - Requires `VITE_YOUTUBE_API_KEY` or `YOUTUBE_API_KEY`.
   - Embeds content using `https://www.youtube-nocookie.com/embed/<id>` with safe privacy parameters.

2. **Vimeo API**:
   - Searches curated videos and creative shorts via official `/videos` endpoint.
   - Requires `VITE_VIMEO_ACCESS_TOKEN` or `VIMEO_ACCESS_TOKEN`.
   - Embeds content using `https://player.vimeo.com/video/<id>?dnt=1`.

3. **Dailymotion API**:
   - Discovers public metadata via `https://api.dailymotion.com/videos` (public keyless search works out-of-the-box, or optional `VITE_DAILYMOTION_API_KEY`).
   - Embeds content using `https://www.dailymotion.com/embed/video/<id>`.

### Admin Discovery & Ingestion Workflow
- Admins can search across any combination of providers from the **Admin Discovery Panel** (`/admin`).
- Discovered candidates are normalized into `ProviderCandidate` objects and stored in RTDB under `/crawler/candidates/<id>`.
- Admins review candidates and click **Publish** to promote a candidate into the live `/posts` and `/postsByFeed/<feed>` indexes.
- Playback uses official responsive iframes (`VideoPlayer`), requiring no local video files on Render.

---

## Important Architectural Notes & Changes

### 1. Complete Removal of Advertising Networks
- All third-party advertising scripts and popunder networks (HilltopAds, Advertica) have been completely removed.
- Components (`AdverticaBanner`, `HilltopAdsVideoSlider`), ad script injection in root routes, and ad worker code have been eliminated for a fast, clean user experience.

### 2. Mock / Seed Video Removal
- Mock horror seed movies (`SEED_HORROR_MOVIES`) that previously referenced broken local `/movies/*.mp4` Render paths have been removed from the production feed path.
- The feeds (`home`, `shorts`, `learn`) now read strictly from live Firebase Realtime Database (`/posts`, `/postsByFeed`). When empty, a clean empty state is shown rather than auto-seeding dummy entries.

### 3. User Video File Hosting Deferred
- **Notice**: User video file hosting on Render's ephemeral container disk is intentionally deferred. In production, persisting video uploads on local container disks causes data loss on container restarts. In a future pass, user video uploads will be routed to dedicated cloud object storage (e.g. S3-compatible or managed media storage). Provider-discovered content (YouTube, Vimeo, Dailymotion embeds) serves as the primary playback engine.

---

## Firebase Realtime Database (RTDB) Setup

### Database Rules (`database.rules.json`)

Deploy the following security rules in the Firebase Console under **Realtime Database > Rules**:

```json
{
  "rules": {
    ".read": true,
    "profiles": {
      "$uid": {
        ".write": "auth != null && auth.uid == $uid"
      }
    },
    "usernames": {
      ".write": "auth != null"
    },
    "posts": {
      "$postId": {
        ".write": "auth != null"
      }
    },
    "postsByFeed": {
      ".write": "auth != null"
    },
    "comments": {
      "$postId": {
        ".write": "auth != null"
      }
    },
    "likes": {
      "$postId": {
        "$uid": {
          ".write": "auth != null && auth.uid == $uid"
        }
      }
    },
    "follows": {
      "$uid": {
        ".write": "auth != null && auth.uid == $uid"
      }
    },
    "notifications": {
      "$uid": {
        ".write": "auth != null"
      }
    },
    "mediaIndex": {
      ".write": "auth != null"
    },
    "crawler": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

---

## API & Streaming Verification Steps

Once deployed (or running locally with `npm run build && npm start`):

### 1. Health Check
```bash
curl -i http://localhost:10000/health
# Expected: HTTP 200 OK {"ok":true,"status":"healthy","service":"xoratv-render"}
```

### 2. Upload Test Media File via `POST /api/upload`
```bash
curl -i -X POST http://localhost:10000/api/upload \
  -F "file=@test_sample.mp4;type=video/mp4" \
  -F "bucket=videos" \
  -F "userId=test_user"

# Expected: HTTP 200 OK with JSON:
# {"ok":true,"path":"videos/test_user/<uuid>.mp4","url":"/videos/test_user/<uuid>.mp4","size":123456,"bucket":"videos"}
```

### 3. Verify Video Playback with Range Streaming
```bash
curl -I -H "Range: bytes=0-1024" http://localhost:10000/videos/test_user/<uuid>.mp4

# Expected Headers:
# HTTP/1.1 206 Partial Content
# Accept-Ranges: bytes
# Content-Range: bytes 0-1024/<total_size>
# Content-Type: video/mp4
```

### 4. Verify Frontend Feeds
- Navigate to `/` (Home feed), `/shorts` (Shorts feed), and `/learn`.
- Verify the feed loads without any Cloudflare or Firestore errors.
- Confirm metadata and posts are queried from Firebase Realtime Database.

---

Xora should NOT look like an AI-generated template, basic dashboard, or unfinished prototype.

The final UI should feel like a serious modern social-media platform.

Visual Quality

Pay attention to:

- Typography

- Spacing

- Alignment

- Card design

- Border radius

- Shadows

- Icons

- Buttons

- Navigation

- Animations

- Transitions

- Loading states

- Empty states

- Error states

- Video cards

- Profile cards

- Comment sections

- Notification cards

- Ad containers

- Upload interface

Maintain a consistent visual design system throughout the entire application.

Do not randomly mix different UI styles.

Mobile Experience

Because Xora is primarily mobile-focused, prioritize the mobile experience.

Make sure:

- Buttons are easy to tap

- Text is readable

- Video cards fit properly

- Shorts feel natural to swipe through

- Bottom navigation feels polished

- Menus do not overflow the screen

- Modals work correctly on small screens

- Uploading is easy on mobile

- Comments are easy to read and interact with

- Sticky advertisements do not cover important controls

- The video player fits correctly on different screen sizes

Desktop Experience

On larger screens, use the available space intelligently.

Do not simply stretch the mobile UI across the entire desktop screen.

Create appropriate:

- Content widths

- Sidebars where useful

- Feed spacing

- Navigation layouts

- Video sizing

- Profile layouts

Micro-interactions

Add subtle professional interactions where appropriate:

- Button hover states

- Press states

- Smooth transitions

- Like animation

- Save animation

- Follow/unfollow feedback

- Notification badge updates

- Loading indicators

- Upload progress

- Skeleton loading

- Smooth feed transitions

Animations should be subtle and fast.

Do not add excessive animations that slow down the application.

Video UI

Give the Xora video player a polished interface.

Make:

- Controls clear

- Play/pause intuitive

- Fullscreen easy to access

- Loading state attractive

- Error state understandable

- Poster image properly displayed

- Shorts controls easy to use

- Interaction buttons visually consistent

Feed UI

The Home, Shorts, and Learn feeds should feel like parts of the same Xora ecosystem while still having their own appropriate layouts.

Avoid clutter.

Prioritize:

Content → Creator → Engagement → Navigation

Forms

Polish:

- Login

- Signup

- Google authentication

- Upload

- Text post creation

- Search

- Profile editing

Forms should have:

- Clear labels

- Validation feedback

- Loading states

- Disabled states

- Success feedback

- Error feedback

Admin Dashboard

The admin dashboard should also look professional.

Use:

- Clean statistics cards

- Tables/lists

- Status badges

- Filters where useful

- Clear moderation actions

- Responsive layouts

Do not make the admin dashboard visually inconsistent with Xora.

Accessibility

Where practical, include:

- Good contrast

- Keyboard navigation

- Accessible buttons

- Meaningful labels

- Proper focus states

- Alt text for meaningful images

- Appropriate semantic elements

Performance

UI polish must NOT come at the expense of performance.

Avoid:

- Heavy unnecessary libraries

- Huge images

- Excessive animations

- Unnecessary network requests

- Rendering huge lists at once

Keep Xora fast.

Final Visual Review

After completing the functional implementation, inspect every major page:

- Home

- Shorts

- Create/Post

- Learn

- Notifications

- Profile

- Login

- Signup

- Search

- Video player

- Comments

- Admin dashboard

Fix obvious:

- Spacing problems

- Alignment problems

- Overflow

- Broken responsive layouts

- Inconsistent buttons

- Inconsistent typography

- Poor mobile layouts

- Unpolished loading states

- Broken empty states

- Visual inconsistencies

The final result should look like a real, launch-ready social platform, not an unfinished development project.

IMPORTANT:

Functionality comes first.

Do not sacrifice backend functionality or core features simply to make the UI prettier.

Once the core Xora V1 functionality is confirmed working, perform the high-grade UI/UX polish pass across the entire application.

32. XORA IS A WEBSITE + PROGRESSIVE WEB APP (PWA)

Xora is a web application first, but it must also be built as a fully functional Progressive Web App (PWA).

Do NOT build Xora as a native Android or iOS application.

Build it as a responsive website that can also be installed on supported devices as a PWA.

PWA Requirements

Implement:

- Web App Manifest

- Service Worker

- Installable PWA

- App name: Xora

- Appropriate Xora app icon

- Splash/loading experience where supported

- Standalone display mode

- Responsive mobile layout

- Responsive tablet layout

- Responsive desktop layout

- Proper theme colors

- Browser address-bar/theme integration where supported

The PWA should be installable from supported mobile browsers.

PWA Navigation

When installed as a PWA, Xora should feel like a real application.

Avoid unnecessary browser-like UI inside the application.

Navigation should remain smooth between:

- Home

- Shorts

- Create/Post

- Learn

- Notifications

- Profile

PWA Performance

Optimize the PWA for mobile users and low-bandwidth connections.

Use:

- Efficient caching

- Lazy loading

- Code splitting where appropriate

- Optimized assets

- Efficient API requests

- Image optimization

- Video poster images

- Proper loading states

Do NOT cache private user data insecurely.

Do NOT cache authentication tokens or sensitive information in an unsafe way.

Offline Behavior

Provide a sensible offline experience.

If the user loses connectivity:

- Show an appropriate offline state

- Do not display broken blank pages

- Preserve safe UI state where practical

- Allow the application to reconnect automatically when connectivity returns

Do not attempt to make video streaming fully offline.

Install Experience

Where browser support allows it, provide an unobtrusive way for users to install Xora.

Do not repeatedly annoy users with installation prompts.

Website Requirements

The same Xora application must work normally as a website through a browser.

Users should be able to access Xora without installing the PWA.

The website must support:

- Direct URLs

- Browser refresh

- Responsive layouts

- Proper routing

- Shareable content URLs

- Search-engine-friendly public pages where appropriate

Important

Xora is a web platform that also functions as a PWA.

Do not turn it into a separate native mobile application.

Build one strong web application and configure it properly as a PWA so the same codebase can serve:

Desktop browser + Mobile browser + Installed PWA.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://xora-sparkle-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/52d4db66-b8d5-4355-b868-e029e6c28ee8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
