# XTv Series UI

Added the frontend-only **XTv Series** page at `/xtv-series`.

## What was built

- New responsive XTv Series discovery page using Xora's existing warm cream/clay design tokens.
- Editorial hero section for the XTv brand.
- Series discovery grid with reusable poster treatment.
- Genre/category filters.
- Search field UI prepared for a future catalog/search endpoint.
- Save/bookmark interaction implemented locally for the prototype.
- Series metadata cards with genre, year, seasons, description and rating presentation.
- A backend-ready empty-state/future-content section explaining that the catalog will be populated later.
- Desktop navigation entry for **XTv Series**.
- Mobile header shortcut for **XTv Series**.
- No Firebase, crawler, API, media, authentication, or backend behavior was changed.

## Future backend contract

The page currently uses local demo data only. A future backend can replace the static `SERIES` collection with an API/query while preserving the UI structure.

Suggested future fields:

- id
- title
- description
- poster
- backdrop
- genre
- year
- seasons
- episode_count
- rating
- tags
- featured
- source/provider
- published_at

The current UI is deliberately separated from that future data source so the backend can be introduced later without redesigning the page.
