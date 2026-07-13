# CLAUDE.md — AI handoff & project context

This file is auto-loaded by Claude Code. It's the pickup point for the next AI/dev
working on this codebase. Read it fully before making changes. See `README.md` for
end-user setup and the seeded logins.

## What this is

**Luxe Supply Co.** — an MVP B2B wholesale portal for **one-of-one luxury goods**
(every piece is unique, quantity always 1). Built from a Claude Design HTML handoff,
following its "tech direction" skin. Three roles share one Next.js app:

- **Buyer** (`/portal`) — catalog, product detail, cart/checkout → invoice, dashboard.
- **Rep / Manager** (`/rep`) — lead routing, bundle builder, manager performance.
- **Fulfillment** (`/fulfillment`) — dark tablet-first pick / pack / ship console.

## Run it

```bash
cp .env.example .env
npm install
npx prisma migrate dev      # creates + seeds ./prisma/dev.db
npm run dev                 # http://localhost:3000
```
Reseed anytime: `npm run db:reset`. Seed logins are in `README.md` (all password `luxe2026`).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 3 · Prisma 6 + SQLite.
Server Components + Server Actions throughout; minimal client state. No external services.

## Architecture / where things live

```
prisma/schema.prisma      All models. prisma/seed.ts = demo data (must keep every screen populated).
src/middleware.ts         Route guards: /portal=BUYER, /rep=REP|MANAGER, /fulfillment=FULFILLMENT.
src/lib/
  constants.ts            SINGLE SOURCE OF TRUTH for statuses/roles/tiers/business rules.
  auth.ts                 Session cookie encode/decode, getSession(), homeForRole, roleCanAccess.
  db.ts                   Prisma singleton.
  format.ts               money()/dates/countdown/initials.
  bundle.ts               bundlePricing() + bundleMargin() — shared by buyer strip & rep builder.
  recommend.ts            similarityScore()/rankSimilar() — "similar pieces" + re-buy recs.
  routing.ts              routeLead() — lead auto-routing algorithm.
  csv.ts                  CSV escaping helpers.
  actions/                Server actions, one file per role: auth, buyer, rep, fulfillment.
src/components/           badges, Placeholder (striped image stand-in), nav bars, builders, modals.
src/app/                  login/ · portal/ · rep/ · fulfillment/  (route handlers for invoice CSV under portal/invoices/).
```

## Domain rules & invariants (don't break these)

- **One-of-one integrity is the core invariant.** A product is in at most one active
  cart hold, order, OR live bundle at a time. Product `status`: `AVAILABLE → ON_HOLD →
  SOLD` (or `BUNDLED`). Selling sets `SOLD` permanently + records `soldToId`/`soldAt`;
  the piece leaves the catalog but is kept for history/recommendations. All mutations
  that move a product are in `src/lib/actions/*` and update status transactionally.
- **48h hold** (`HOLD_HOURS`) is placed when a piece is added to a cart.
- **$2,500 minimum order** (`MIN_ORDER_VALUE`) — enforced in the cart UI *and* re-checked
  server-side in `checkout()`.
- **Account tier** derives from trailing-12-month spend: T1 ≥ $50k, T2 $10–50k, T3 < $10k
  (`tierForSpend`). Stored as `Account.trailing12Spend`; never hardcode tier.
- **Lead auto-routing** on creation: Tier 1 → senior reps (lightest load); Tier 2/3 →
  round-robin by open-lead load (`routeLead` in `routing.ts`, called from `createLead`).
- **Checkout** generates a Net-30 `Invoice` (no card) + a `FulfillmentTask` (status `TO_PICK`).
- **Fulfillment flow:** TO_PICK → PICKING (first pick verified) → PACKING (all verified) →
  SHIPPED. "Mark shipped" is gated on a complete packing checklist + carrier + tracking,
  enforced in `markShipped()`. Shipping updates the buyer's order status.

## Conventions (follow these when extending)

- **SQLite has no enums.** All status/role fields are `String`, constrained by the
  constant objects in `src/lib/constants.ts`. Add new statuses there, not inline.
- **Money is whole US dollars** (Int), formatted with `money()`. No cents anywhere.
- **Server actions used as `<form action={...}>` must return `void`/`Promise<void>`.**
  Actions that return a value (e.g. `addToCart` returns `{error}` for client use) have a
  void wrapper for form usage (e.g. `addToCartForm`). Keep this split.
- **Design tokens** live in `tailwind.config.ts`: `ground #FAFAF8`, `surface`, `border
  #E4E3DE`, `ink #16161A`, `secondary`, `muted`, `accent #B08D3E` (gold, signal color
  only), `success`, `danger`, plus dark `rep-dark`/`ful-ground`. Font: Space Grotesk
  (`font-sans`); all data (SKUs, prices, timestamps, locations) uses `font-mono`.
- **Badge system** is centralized in `src/components/badges.tsx` (InvoiceBadge,
  OrderBadge, TierBadge, LeadStatusBadge). Every product image gets the black `1/1`
  badge via `OneOfOneBadge`. Reuse these; don't hand-roll badges.
- **Product imagery is a placeholder** (`Placeholder` component, striped block) — real
  photos are out of scope for the MVP; `Product.images` is a JSON string of labels.
- **Every list/queue has a designed empty state** (`EmptyState`). Keep that up.
- Auth is a signed-ish cookie (`base64("userId|role")`) — **demo only, not real auth.**
  Passwords are plain text in the seed. Replace before any real deployment.

## Current state

Done & verified (build green, all routes smoke-tested 200 with role guards):
- Full buyer portal, rep console, fulfillment console per the original spec.
- Invoice **PDF (print) + CSV** download (single + full-list export).
- Sign out in all three headers.

Git history (local only, not pushed): scaffold+buyer → rep console → fulfillment+README
→ invoice CSV + sign-out → .env.example. Committed with `git`.

## Intentionally NOT built (MVP scope) — likely next steps

- No payments (invoice-only), **no email** (send events `console.log` only), no real
  image uploads.
- Not production auth (see above) — swap for real sessions/hashing + a proper login.
- Holds don't auto-expire on a timer; expiry is displayed but not reaped by a job.
- Rep performance numbers are denormalized demo stats on `User` (`statSalesQuarter` etc.),
  not computed from live orders — wire to real aggregates if this becomes real.
- No tests. No CI. Single SQLite file (fine for local; swap `datasource` for Postgres to deploy).

## Gotchas

- Don't run `next build` while `next dev` is running — they share `.next` and can corrupt
  each other's state. Stop dev first (or use a separate output).
- After editing `prisma/schema.prisma`, run `npx prisma migrate dev` (regenerates client).
- Keep `prisma/seed.ts` exhaustive: the demo must show ≥1 overdue invoice, ≥1 draft,
  a live bundle, a below-minimum cart, pending call requests, leads in every tier, and
  orders in every fulfillment status. Adding a feature usually means adding seed data.
```
