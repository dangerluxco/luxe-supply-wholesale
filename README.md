# Luxe Supply Co. — Wholesale Portal (MVP)

> **Active app in this monorepo.** See [BRIDGE.md](./BRIDGE.md) for how this relates to the live Firebase `/wholesale` portal and ItemIQ catalog sync (`npm run sync:itemiq`).

A B2B wholesale portal for one-of-one luxury goods. Nearly all inventory is unique
(quantity always 1), so **one-of-one integrity is the core invariant**: a piece can only
be in one active cart hold, order, or live bundle at a time, and selling it marks it
`SOLD` permanently (removed from the catalog, kept for history + recommendations).

Three roles share one app:

- **Buyers** (`/portal`) — browse the catalog, request video viewings, build an order, check out into an invoice.
- **Sales reps & managers** (`/rep`) — lead routing, bundle building, and (managers) a performance leaderboard.
- **Fulfillment** (`/fulfillment`) — a dark, tablet-first pick / pack / ship console for the vault.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS** — tech-direction design system (Space Grotesk, `#FAFAF8` ground, champagne-gold `#B08D3E` signal accent, mono data)
- **SQLite via Prisma** — no external services
- Session-based auth (seeded users per role) with role-based route guards in `middleware.ts`

## Setup

Requires Node 18+. Uses `pnpm` below; **npm** and **yarn** work identically (same scripts).

```bash
cp .env.example .env           # sets DATABASE_URL for local SQLite
pnpm install
pnpm prisma migrate dev        # creates ./prisma/dev.db and applies the schema
pnpm prisma db seed            # loads realistic demo data (also runs automatically after migrate)
pnpm dev                       # http://localhost:3000
```

With npm:

```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

To wipe and reseed at any time: `pnpm db:reset` (or `npx prisma migrate reset --force`).

## Seeded logins

Every account uses the password **`luxe2026`**.

| Role | Email | Who |
| --- | --- | --- |
| Buyer | `buyer@luxesupply.co` | Mara Iselin · Meridian Interiors (Tier 1) |
| Buyer | `aurelia@luxesupply.co` | Luca Renaud · Hotel Aurelia Group (Tier 1) |
| Buyer | `castellane@luxesupply.co` | Inès Castellane · Castellane & Co. (Tier 2) |
| Sales rep | `rep@luxesupply.co` | Adele Fontaine · senior specialist |
| Sales rep | `jonas@luxesupply.co` | Jonas Keller · senior specialist |
| Sales rep | `marcus@luxesupply.co` | Marcus Webb · specialist |
| Manager | `manager@luxesupply.co` | Dana Osei · sales director (sees **Performance**) |
| Fulfillment | `fulfillment@luxesupply.co` | Theo Keady · Geneva vault |

The login screen lists the primary four and prefills them on click.

## What the demo data covers

Everything is populated so every screen looks live on first run:

- **42 products** across Objets, Silver, Glass, Furniture, Lighting — with provenance, condition, marks, vault locations, and est. retail ranges.
- **1 live bundle** ("The Collector's Edit", 8% off) shown on the catalog; plus a draft bundle.
- **Meridian's active cart** sits *below* the $2,500 minimum, so checkout is locked and add-on suggestions appear.
- **Invoices in every status** — including one **OVERDUE** and one **DRAFT**.
- **Orders in every fulfillment status** — `TO_PICK`, `PICKING`, `PACKING`, `SHIPPED` (with carrier + tracking).
- **Leads in every tier** (1/2/3) and status (NEW → WON/LOST), each showing its auto-routing reason.
- **Pending video-call requests** waiting in the rep's rail.

## Feature notes

### Buyer portal (`/portal`)
- **Catalog** — filter chips (category, material, era, price, availability), **⌘K** command search, and the rep-curated bundle strip with individual-vs-bundle pricing and an "add all" CTA.
- **Product detail** — gallery, provenance/condition/marks table, wholesale + est. retail, **"Request a video viewing"** modal (day picker → time slots → note → confirmation), and **similar pieces** scored by category/material/era with a match %.
- **Cart & checkout** — live 48h hold countdowns, a **$2,500 minimum** progress bar with gap-closing suggestions, and checkout that **generates a Net-30 invoice** (no card) plus a printable PDF view.
- **Client dashboard** — spend stat row, invoices table with PDF links, tier + assigned-rep card, and "based on your last order" re-buy recommendations.

### Rep console (`/rep`, dark header)
- **Lead queue** with tier badges and **auto-routing on creation** — Tier 1 → senior reps (lightest load), Tier 2/3 → round-robin by load. Add a lead to watch it route live. Click a lead's status chip to advance its stage.
- **Bundle builder** — pick AVAILABLE pieces (bundled ones are disabled), set a % or flat discount, and see the **exact buyer-facing card plus a margin breakdown** update live. Publish locks the pieces out of the catalog.
- **Performance** (managers only) — leaderboard (sales bar, invoices, AOV, conversion, calls) and a per-rep panel with a trailing-12-month bar chart. Click any rep to switch the panel.

### Fulfillment (`/fulfillment`, dark, tablet-first, ≥44px targets)
- Status-tab queue (**TO PICK / PACKING / SHIPPED** with counts).
- Per-item pick cards with a reference photo, a big mono **vault location** tag, and a **"Verify with photo"** step (MVP: confirm-against-reference button + timestamp; camera capture stubbed) required before a pick counts.
- Packing checklist, carrier select + tracking entry, and **"Mark shipped" stays disabled until the checklist is complete** and tracking is entered. Shipping an order updates the buyer's order status.

## MVP scope / omissions

- No payments (invoice-only), **no email** (send events are logged to the server console), and **no real image uploads** — product imagery is a striped placeholder component, with a black `1/1` badge on every piece.
- Auth is a simple signed-cookie session over seeded users (password stored in plain text for the demo) — not production auth.
- Money is stored as whole US dollars; SQLite has no enums, so status/role fields are `String` constrained by `src/lib/constants.ts`.

## Project layout

```
prisma/
  schema.prisma        # all models
  seed.ts              # demo data
src/
  middleware.ts        # /portal /rep /fulfillment role guards
  lib/
    constants.ts       # statuses, tiers, business rules (MIN_ORDER_VALUE, HOLD_HOURS…)
    auth.ts            # session encode/decode, getSession, role helpers
    bundle.ts          # bundle pricing + margin math (shared buyer/rep)
    recommend.ts       # similar-piece scoring
    routing.ts         # lead auto-routing
    actions/           # server actions: auth, buyer, rep, fulfillment
  components/          # badges, placeholders, nav bars, builders, modals
  app/
    login/            portal/            rep/            fulfillment/
```
