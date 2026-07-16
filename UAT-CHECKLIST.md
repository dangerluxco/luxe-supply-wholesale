# Luxe Supply — Wholesale UAT Checklist

Use this checklist to accept the **buyer Storefront** (`/wholesale`) and **staff Sales Portal** (`/wholesaleportal`) before release. It is written for a non-engineer UAT owner and can be copied into Google Docs, Notion, or Slack as-is.

---

## Environments

| Surface | Production URL | Local (optional) |
| --- | --- | --- |
| Buyer storefront | https://photography-964f5.web.app/wholesale | http://localhost:3000/wholesale/sign-in |
| Staff Sales Portal | https://photography-964f5.web.app/wholesaleportal | http://localhost:3000/wholesaleportal/sign-in |

- Prefer **production** Hosting URLs for UAT.
- Use local only if debugging (`npm run dev` inside `luxe-supply-wholesale`).
- Cron (ops): production job `luxe-expire-bundles` POSTs `https://photography-964f5.web.app/api/cron/expire-bundles` daily at 6:00 America/New_York. Local curl details live in `BRIDGE.md` (engineering).

### Environment checks

- [ ] Open prod buyer URL https://photography-964f5.web.app/wholesale — page loads (or redirects to sign-in).
- [ ] Open prod staff URL https://photography-964f5.web.app/wholesaleportal — page loads (or redirects to sign-in).
- [ ] If testing locally: `npm run dev` in `luxe-supply-wholesale` → buyer http://localhost:3000/wholesale/sign-in · staff http://localhost:3000/wholesaleportal/sign-in.

---

## Credentials

| Role | Username / email | Password |
| --- | --- | --- |
| Staff (Sales Portal) | `dan@luxesupply.co` | Provided separately by Luxe — confirm with the team |
| Buyer (Storefront) | `howcouldyouforget` | Provided separately by Luxe — confirm with the team |

Do **not** treat any local/dev sign-in form prefill as production password documentation.

### Login checks

- [ ] Staff sign-in with `dan@luxesupply.co` (password from Luxe / team).
- [ ] Buyer sign-in with username `howcouldyouforget` (password from Luxe / team).

**Tip:** Prefer a throwaway/test cart on the demo buyer so real buyer holds are not blocked.

---

## How to use

1. Work top to bottom (Smoke first, then Storefront, Sales Portal, Ops, Edge cases).
2. Check the box `- [ ]` when the step **passes**. Leave unchecked or mark **Fail** in Notes if it does not.
3. Mark **N/A** in Notes when a step does not apply to this rollout (e.g. fulfillment).
4. For every failure, report:
   - Screenshot
   - Exact URL
   - Steps to reproduce
   - Expected vs actual
5. Do **not** deploy from this checklist.

### Business rules under test (quick reference)

| Rule | Expected |
| --- | --- |
| Default cart hold limits | 5 items / $5,000 (staff editable per client) |
| Cart + invoice-request holds | 7 days soft hold |
| Invoice request timeout | 7 days → Timed out; holds released |
| Suggested lot auto-archive | 14 days → SKUs back to catalog |
| Cron | `luxe-expire-bundles` daily 6:00 America/New_York |
| Submit CTA | **Submit for review** → invoice request queue (not “quote”) |

---

## 1. Smoke

- [ ] Staff: sign in at `/wholesaleportal/sign-in` → land in Sales Portal (invoice requests / rep home).
- [ ] Buyer: sign in at `/wholesale/sign-in` → land on storefront catalog (`/wholesale`).
- [ ] Catalog and product/lot cards show main images (no widespread broken images). Logo and nav visible on both surfaces.
- [ ] Sign out from buyer and staff; protected routes bounce back to each side’s sign-in.

---

## 2. Storefront (buyer)

### Catalog & PDP

- [ ] Browse `/wholesale` catalog — pieces load; search/filters usable if shown.
- [ ] Open a product by SKU (`/wholesale/product/[sku]`) — detail page loads with price/images; add to cart works when available.
- [ ] SKUs inside an active suggested lot do **not** appear as individual catalog cards (only via the lot).

### Suggested lots

- [ ] If a suggested lot is shown for this buyer: open/add the lot to cart — all pieces hold as one cart line; duplicate SKUs not listed twice inside the lot.

### Cart & holds (7 days)

- [ ] Add 1–2 available pieces to cart → `/wholesale/cart` shows soft-hold countdown (~7 days) and limit text (default up to 5 items / $5,000).
- [ ] With 2+ items in cart, remove one → remaining items stay; no error; holds release only for the removed SKU(s).

### Cart limits

- [ ] Try adding more than the client item limit (default 5) → blocked with clear limit message.
- [ ] Try exceeding the $ limit (default $5,000) → blocked with clear dollar-limit message.

### Invoice request submit

- [ ] Cart → **Submit for review** → redirects to `/wholesale/orders`; request appears as an invoice request (not labeled “quote”).

### Orders & invoices

- [ ] `/wholesale/orders` lists submitted requests with status; if an invoice number exists, link opens `/wholesale/invoices/[number]`.

### Wishlist & account

- [ ] `/wholesale/wishlist` — add/remove wishlist items without breaking catalog navigation.
- [ ] `/wholesale/account` — profile loads; change password if offered (current + new ≥6 chars) and re-sign-in works.

### Registration

- [ ] From sign-in, open Request to join (`/wholesale/register`) — submit a test application (use a unique company/email); confirmation shown.

---

## 3. Sales Portal (staff)

### Buyer registration

- [ ] `/wholesaleportal/rep/applications` — new application appears; open detail.
- [ ] Accept application → buyer account created; temp password shown; rejected apps do not get storefront access.

### Clients

- [ ] `/wholesaleportal/rep/clients` lists clients; open a client detail without blank/error page (soft-nav from list → detail works).
- [ ] Client detail → Order hold limits: change max items and/or max $ → save → buyer cart reflects new limits on next add attempt.
- [ ] Client detail shows current cart / holds and recent invoice requests when present.

### Wishlist & alerts

- [ ] `/wholesaleportal/rep/wishlist` — staff can see buyer wishlist interest / hold-related alerts as designed.

### Invoice requests

- [ ] Rep home `/wholesaleportal/rep` — buyer submission appears under Invoice requests (statuses include Open / Contacted / Declined / Timed out, etc.).
- [ ] Open request detail — line items show with product images; edit lines/notes/status without page crash.
- [ ] Remove a line item from an open request → that SKU’s hold releases and piece can return to catalog/cart availability.
- [ ] Set status Declined → holds for remaining lines release; buyer Orders reflects declined.
- [ ] Generate invoice from a reviewed request → formal invoice created; SKUs marked sold / off store; buyer can see invoice number on Orders.

### Formal invoices

- [ ] `/wholesaleportal/rep/invoices` — list and open invoice detail; status (e.g. SENT/PAID) and line totals look correct.

### Suggested lots / bundles

- [ ] `/wholesaleportal/rep/bundles` — create lot for a client (pick SKUs, discount, publish) → Active lots card shows title, piece count, main images.
- [ ] Edit an active lot — already-selected SKUs appear first in the picker; save changes updates the lot and buyer-facing strip.
- [ ] Cannot add the same SKU twice in one lot (SKU unique / deduped); catalog picker does not double-list the same SKU.
- [ ] Archive a lot manually → its SKUs return to individual catalog sale on the storefront.

### Catalog curation

- [ ] `/wholesaleportal/rep/catalog` — switch curated vs full mode; paste/save curated SKU list; unresolved SKUs reported; storefront matches the chosen mode.

### Thresholds & settings

- [ ] `/wholesaleportal/rep/settings` — set min item count / min cart total and notify emails; buyer Submit for review respects thresholds (blocked under threshold with message).

### SKU PDP / catalog

- [ ] From staff flows, SKU links / lookups open the correct product (no wrong-SKU / empty PDP regression).

### Fulfillment (if used)

- [ ] If fulfillment console is in use for this rollout: `/fulfillment` loads for fulfillment role, or invoice fulfillment status (unfulfilled/shipped) updates after ship — otherwise mark N/A.

---

## 4. Cross-cutting / Ops

### Holds expiry (7 days)

- [ ] UI copy matches rules: cart soft holds 7 days; after Submit for review, holds continue up to 7 days while staff reviews.
- [ ] Pending open/contacted invoice requests older than 7 days become Timed out (cron) — holds released; suggested lots on that request deactivated.

### Bundle auto-archive (14 days)

- [ ] Active suggested lots older than 14 days auto-archive via nightly job — SKUs return to catalog (confirm via ops log or a known old lot).

### Cron / expire-bundles

- [ ] Cloud Scheduler job `luxe-expire-bundles` POSTs `/api/cron/expire-bundles` with `Authorization: Bearer CRON_SECRET` daily 6:00 America/New_York (prod Hosting → Cloud Run). Local: curl with `CRON_SECRET` as in `BRIDGE.md` (engineering can confirm).

### Mobile spot-check

- [ ] Phone/narrow viewport: buyer catalog, cart Submit for review, and Orders readable; primary buttons reachable.
- [ ] Tablet/narrow: staff invoice-request detail and client detail usable enough for review actions.

---

## 5. Edge cases & regressions

### Known regressions

- [ ] Duplicate SKU keys: catalog/lot builders never render the same SKU twice as two pickable rows; React keys stable (no console key warnings on lots).
- [ ] Soft-nav Clients list → client detail: save hold limits / invite buyer without webpack stub / “undefined is not a function” errors.
- [ ] Cart remove with remaining items (especially lots / missing lotId) succeeds — prior Firestore undefined `lotId` failure must not return.
- [ ] HOLD limits: after staff raises limits, buyer can exceed old default; after lowering below current cart size, further adds blocked until cart shrinks.
- [ ] Buyer and staff UI say **invoice request** / **Submit for review** — not legacy “quote” wording in primary CTAs and page titles.

---

## Sign-off

| Field | Value |
| --- | --- |
| Tester name | |
| Date | |
| Environment (prod / local) | |
| Pass / Fail overall | |
| Notes / blockers | |

When overall is **Fail**, paste failure reports below (screenshot + URL + steps for each):

1.
2.
3.
