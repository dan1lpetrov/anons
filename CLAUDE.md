# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## UI / design

Any UI work (colors, typography, spacing, components, layout) must follow **`DESIGN.md`** at the repo root — it defines two independent design systems: the Admin Panel (light/dark SaaS-dashboard look) and the Storefront (mobile-first Telegram mini app look), each with its own color tokens, type scale, and component rules. Read it before touching `src/index.css`, any file under `src/components/`, or `public/assets/admin.css`. If the user asks to change the design direction, update `DESIGN.md` itself so it stays the source of truth, not just the code.

## What this is

A Telegram Mini App storefront ("Anons Shop") that lists clothing/shoes scraped from brand sale/outlet pages (Nike, Adidas, Puma — `saleId` in the data model), lets a user browse, add to cart, and "check out." Checkout does **not** process any payment — it produces a formatted order summary (`src/utils/orderExport.ts`) meant for the shop owner to manually re-purchase the items on the source site. There is no backend order fulfillment beyond saving the order to `localStorage` and rendering a summary screen.

Products are not entered by hand. They come from a **separate, external scraper project** (`~/Documents/scrap`, its own git repo, Python) that scrapes brand listing/product APIs into JSONL with `curl_cffi`/Playwright. That data is pasted or file-uploaded through this app's `/admin` panel, which normalizes it and POSTs it into Postgres. There is no scheduled or automatic sync between the two repos — every catalog update is a manual paste-and-upload through `/admin`.

## Commands

- `npm run dev` — Vite dev server.
- `npm run build` — `tsc -b && vite build` (type-checks both `src/` via `tsconfig.app.json` and `api/` via `tsconfig.node.json`, then bundles).
- `npm run lint` — `oxlint`.
- `npx tsc -b` — type-check only, no bundling; fast way to verify a change compiles (covers `src/` and `api/` together).
- No test suite exists in this repo.

## Architecture

### Two-repo pipeline (important — read this before touching pricing/catalog code)

1. Scraper (`~/Documents/scrap`, unrelated git repo) hits brand APIs and outputs `UnifiedProduct`/`ColorVariant` JSONL, one JSON object per line. Each `ColorVariant` carries **its own** `pricing` (`sale_price`/`original_price`) — Adidas genuinely prices some colorways of the same product differently.
2. That raw JSONL is pasted (or file-uploaded) into `public/admin.html`, a **standalone static page** (no build step, no React) served via the Vercel rewrite `/admin` → `/admin.html`. Its inline `normalizeProduct()` function is the *only* place that maps the scraper's raw shape (`product_id`, `title`, `colors[].pricing.sale_price`, …) onto this app's `Product` type. Any new field the scraper starts emitting has to be threaded through this function by hand.
3. Upload posts to `POST /api/products`, which stores each product as a single `data JSONB` blob per row in Postgres (`api/_lib/db.ts` lazily creates the schema on first call). The React app just does `GET /api/products` and renders whatever blobs come back — there's no server-side reshaping.

Because of this, **prices live at two levels**: `Product.price`/`originalPrice` (used for catalog sort/display and as a fallback) and an optional `ProductColor.price`/`originalPrice` (an override for that specific color). Always resolve prices through `colorPrice()` / `colorOriginalPrice()` in `src/utils/format.ts` instead of reading `product.price` directly — reading the top-level field directly silently ignores a color-specific override.

Editing files locally has **zero effect on the live site** until committed and pushed to `origin/main` (Vercel auto-deploys from there). After deploying a change to how products are shaped or priced, existing rows in Postgres are still JSON blobs saved by whatever `normalizeProduct()` looked like at upload time — they must be **re-uploaded through `/admin`** to pick up the new shape; a deploy alone does not touch stored data.

### `saleId` is a closed brand enum

`SaleId = 'nike' | 'adidas' | 'puma'` (`src/types/index.ts`) is hardcoded and mirrored by a `SALES` map inside `admin.html` (brand display name + source URL) and by `src/data/sales.ts` (display metadata for the catalog UI). The scraper currently only implements Adidas (`scrap/scrapers/adidas.py`). Adding a new brand means touching all three of: the scraper, the `SaleId` union, and `admin.html`'s `SALES` map.

### Admin auth

Single-admin Google OAuth, not multi-user auth: `api/auth/login.ts` redirects to Google, `api/auth/callback.ts` exchanges the code, `api/_lib/session.ts` issues a JWT session cookie. `requireAdmin()` gates every mutating endpoint (`POST/DELETE /api/products`, `/api/sales`) and simply checks the session email against a single `ADMIN_EMAIL` env var — there's no roles/permissions system to extend, just that one allowlisted address.

Required env vars: `SESSION_SECRET`, `ADMIN_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET` (gates `/api/cron/recompute-scores` — Vercel sends it as `Authorization: Bearer $CRON_SECRET` automatically for its own Cron invocations when this var is set; without it the cron route falls back to admin-session auth only, so Vercel Cron calls will 401), plus whatever Postgres connection vars `@vercel/postgres` expects (auto-populated by the Vercel Postgres integration).

### Sales lifecycle

A "sale" (`sale_windows` table) is a per-`saleId` row with `end_date`/`active`. Products past their sale's `end_date` are excluded by `GET /api/products`'s `WHERE` clause. The admin panel can pause a sale (`active: false`, keeps data) or fully delete one (`DELETE /api/sales?saleId=...`, removes both the `sale_windows` row and every product with that `sale_id` — irreversible).

### Client app structure

`src/App.tsx` is a single-page state machine over a `Screen` union (`home|catalog|product|cart|success`), not a router — navigation is manual `window.history.pushState`/`popstate` handling. `'home'` (curated landing: banners, top-N products, category tiles) is the initial/root screen; `'catalog'` (full filtered/sorted grid) is a separate screen reached via "Дивитись всі" or a category tile, not the default anymore. Telegram WebApp integration lives in `src/hooks/useTelegram.ts` (haptics, MainButton/BackButton, `initDataUnsafe.user`, theme sync — see the dark-mode gotcha in the design memory). Note: the Telegram-native MainButton's "add to cart" handler in `App.tsx` always adds `product.colors[0]`/`sizes[0]` regardless of what's selected in `ProductDetail`'s own state — it doesn't share state with the in-page size/color pickers.

Cart state (`src/hooks/useCart.ts`) persists to `localStorage` under `anons-cart`, keyed by `productId:size:colorId`. It resolves per-line pricing by looking up the cart item's color on the current `Product` object, so a cart line's price always reflects the color actually chosen — see the pricing note above for why this matters.

### Home screen banners

`banners` table (`api/_lib/db.ts`) is a small admin-managed CMS — the only hand-curated content in an otherwise fully-scraped catalog. `api/banners.ts`: `GET` is public and returns only `active` rows ordered by `sort_order` (for the storefront carousel); `GET ?all=1` is admin-gated and returns every row (for `/admin/banners`'s management list). `POST`/`DELETE` are admin-gated. Each banner links to at most one destination — an optional `linkCategoryId` (same `categoryId` values products already carry) or an optional `linkSaleId` (one of the `SaleId` brand enum, offered in `/admin/banners` only from currently-active sales per `GET /api/sales`); `api/banners.ts`'s `handlePost` enforces the mutual exclusion server-side (a sale link wins if both are somehow sent). Tapping a banner in `BannerCarousel` calls `Home`'s `onSelect`, which routes to Catalog filtered by category, or to `/catalog?brands=<saleId>` (reusing the existing brand-filter query param from `useCatalogParams`, not a dedicated sale route) for a sale link, or to the unfiltered Catalog if neither is set.

Banner images are uploaded (not just pasted as a URL) via `POST /api/banners?upload=1&filename=...` — a branch inside `api/banners.ts`'s handler rather than its own `api/` file, because the project is already at Vercel Hobby's 12-serverless-function cap (see "Two-repo pipeline"'s sibling commit history). It streams the request body straight into Vercel Blob storage with `@vercel/blob`'s `put()` and returns the resulting public URL for `/admin/banners` to save as `imageUrl`. This requires a Vercel Blob store attached to the project (`BLOB_READ_WRITE_TOKEN` auto-populated, same pattern as the Postgres integration) — without it, uploads 500. Pasting an image URL directly still works as a fallback, same as product images.

## Product ranking score (global sort done; personalization not yet)

Goal: sort the catalog so "interesting" products surface first. `GET /api/products` now `ORDER BY product_scores.score DESC NULLS LAST` (falls back to `featured_rank ASC, id ASC` for products with no score row yet, e.g. just uploaded and not yet cron'd). Client-side `sortProducts()` (`src/utils/catalog.ts`) no longer re-sorts for `'recommended'` — it trusts the server order as-is; only `price-asc`/`price-desc` still sort client-side.

Signals: discount %, price relative to that product/color's own history, view count, order count, a rolling 24-72h "trending" window, and a personalization boost from item-item co-occurrence ("users who ordered X also ordered Y").

**Tables** (`api/_lib/db.ts`)
- `product_events` — `id SERIAL`, `telegram_user_id TEXT` (nullable — no Telegram identity outside the Telegram client), `product_id TEXT`, `event_type TEXT` (`'view'` | `'order'`), `created_at TIMESTAMPTZ DEFAULT now()`. Append-only.
- `product_scores` — `product_id TEXT PRIMARY KEY`, `score NUMERIC`, `computed_at TIMESTAMPTZ`. One precomputed row per active product, fully replaced (`TRUNCATE` + bulk insert) on every recompute.
- `product_similar` — `product_id TEXT`, `similar_product_id TEXT`, `weight NUMERIC`, PK on the pair. Top 10 co-ordered products per product. **Written but not yet read anywhere** — personalization re-ranking on top of the global score is the remaining piece of this feature.

**Write path** (`api/events.ts`, `src/utils/events.ts`): `POST /api/events` takes a batch `{ events: [{ productId, eventType, telegramUserId }] }`, one multi-row INSERT. Client fires `keepalive: true`, catch-and-ignore fetches: a `view` on `openProduct()` in `App.tsx`, and one `order` event per unique product id when `handleSubmitOrder` writes the order summary to `localStorage`.

**Score computation** (`api/cron/recompute-scores.ts`): batch job, the only place that aggregates `product_events` — never do that in a request path. Pulls active products, aggregates event counts (lifetime view/order + a 48h trending window) in one grouped SQL query, pulls per-color `price_history` medians (`percentile_cont(0.5)`) for the price-vs-history signal, computes discount % and price-drop-vs-history in JS per product (max across colors, using `color.price ?? product.price` the same way `colorPrice()` does), percentile-ranks each raw signal 0..1 across the active catalog, and combines with weights loaded via `getWeights()` (`api/_lib/weights.ts`) from the single-row `score_weights` table — falls back to `DEFAULT_WEIGHTS` (discount 0.25, priceVsHistory 0.25, views 0.15, orders 0.25, trending 0.1) if no row has been saved yet. Weights are editable from `/admin`'s "Ваги ранжування товарів" section (`GET`/`POST /api/score-weights`, admin-gated); saving there also immediately triggers a recompute so a weight change is visible right away, not just at the next cron tick.

`percentileRanks()` in that file ranks by "count of values strictly less than this one, divided by (n-1)" — **not** by sorted array position. This matters because ties must land on the exact same rank: when every product has the same raw value for a signal (e.g. 0 views/orders/trending, the common case before real traffic accumulates), position-based ranking would hand out an arbitrary 0..1 spread based on whatever order Postgres returned rows in, injecting fake signal into up to half the composite's weight. The count-based version correctly collapses ties to one rank instead.

A product with zero price-history points gets a **neutral 0.5** for that one signal instead of 0, so genuinely new products aren't buried just for lacking history; every other signal defaults to a real 0 (no views/orders/discount is a real, not missing, data point). Same pass recomputes `product_similar` via a co-occurrence self-join on `product_events` grouped by `telegram_user_id`.

**Triggering the job:** project is on the **Vercel Hobby plan**, so `vercel.json`'s `crons` entry (`0 3 * * *`) can only run once/day. `public/admin.html`'s upload flow also calls `POST /api/cron/recompute-scores` right after a successful upload so catalog changes don't wait up to 24h. The route accepts either an admin session cookie (`requireAdmin`) or a `CRON_SECRET` bearer token (see env var list above) — Vercel Cron authenticates with the latter automatically.

**Read path:** `GET /api/products`'s `Cache-Control` moved from `max-age=0` to `max-age=60, stale-while-revalidate=300` since score only changes on the cron cadence.

**Not yet built — personalization:** `product_similar` is computed and stored but nothing reads it yet. Per the original plan: fetch the (cacheable) globally-sorted list, then re-rank using that user's own recent `product_events` joined against `product_similar`, bounded by a small `LIMIT`-ed lookup on indexed tables — never a recompute, and never per-user data riding the public `GET /api/products` cache.
