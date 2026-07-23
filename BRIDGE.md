# Bridging ItemIQ Firebase portal → Next.js

This app (`luxe-supply-wholesale/`) is the Luxe Supply wholesale **buyer + staff** UI on Cloud Run.

| Surface | Prod URL | Data |
| --- | --- | --- |
| Buyer storefront | https://portal.luxesupply.co/ → `/wholesale` | Next → Firestore buyers/catalog/cart/quotes |
| Staff portal (reps) | https://rep.luxesupply.co/ → `/wholesaleportal` | Next → Firestore staff/quotes/clients/catalog |
| Staff portal (admins) | https://admin.luxesupply.co/ → `/wholesaleportal` | Same as reps |
| Fulfillment | https://ppas.luxesupply.co/ | Same Cloud Run service |
| Legacy Hosting paths (still work) | https://photography-964f5.web.app/wholesale[portal] | Same Cloud Run service |

Custom domains live on **separate** Firebase Hosting sites (same Cloud Run backend).
July 2026 scheme: `portal.` = buyers, `rep.` = reps, `admin.` = admins, `ppas.` =
fulfillment; `wholesale.luxesupply.co` and `wholesaleportal.luxesupply.co` are retired
(their DNS records were removed; the Firebase customDomain entries still exist).

| Domain | Hosting site |
| --- | --- |
| `portal.luxesupply.co` | `luxe-wholesale` |
| `rep.luxesupply.co`, `admin.luxesupply.co`, `ppas.luxesupply.co` | `luxe-wholesale-portal` |

```bash
cd luxe-supply-wholesale
firebase deploy --only hosting
```

Firebase Hosting rewrites **both** `/wholesale/**` and `/wholesaleportal/**` to Cloud Run service `luxe-wholesale-portal`. Do **not** set `NEXT_BASE_PATH` — the app serves both route trees from one image.

## Run locally

```bash
cd luxe-supply-wholesale
cp .env.example .env
npm install
npx prisma generate
gcloud auth application-default login
npm run dev
```

- Buyer: http://localhost:3000/wholesale/sign-in  
- Staff: http://localhost:3000/wholesaleportal/sign-in  

## Deploy to production

```bash
cd luxe-supply-wholesale
gcloud builds submit --tag gcr.io/photography-964f5/luxe-wholesale-portal --project photography-964f5
gcloud run deploy luxe-wholesale-portal \
  --image gcr.io/photography-964f5/luxe-wholesale-portal \
  --region us-central1 \
  --project photography-964f5 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --update-env-vars "GCLOUD_PROJECT=photography-964f5,NODE_ENV=production,BUYER_ORIGIN=https://portal.luxesupply.co,STAFF_ORIGIN=https://luxe-wholesale-portal.web.app"

cd ../ItemIQ-Marketing-Website
firebase deploy --only hosting
```

`--update-env-vars` (not `--set-env-vars`) is deliberate: it merges and preserves
other runtime env vars — notably the Google OAuth creds below. `--set-env-vars`
replaces the whole set and silently wipes them, which breaks "Sign in with Google".

Do NOT set `PUBLIC_HOST=photography-964f5.web.app` (the pre-July-2026 setup): it
feeds every generated buyer/staff link (curation shares, order/invoice emails,
calendar invites), and that legacy Hosting site no longer rewrites portal routes
to Cloud Run — links on it dead-end in the old photo app. `BUYER_ORIGIN` /
`STAFF_ORIGIN` above are the explicit replacements.

**Google OAuth env vars (required for "Sign in with Google" in prod).** These are
NOT baked into the image; set them on the Cloud Run service once:
```bash
gcloud run services update luxe-wholesale-portal --region us-central1 --project photography-964f5 \
  --update-env-vars "GOOGLE_OAUTH_CLIENT_ID=...,GOOGLE_OAUTH_CLIENT_SECRET=..."
```
Values live in `.env` (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET). The
redirect URI is derived from the request host (`x-forwarded-host`), so every
user-facing domain's `…/api/auth/callback/google` must be an Authorized redirect
URI on the OAuth web client in Google Console — including
`https://luxe-wholesale-portal.web.app/api/auth/callback/google` (staff) plus the
July-2026 domains: `https://portal.luxesupply.co/...` (buyer),
`https://rep.luxesupply.co/...`, `https://admin.luxesupply.co/...`, and
`https://ppas.luxesupply.co/...` (staff/fulfillment).

`--min-instances 1` keeps one warm instance so the first click after idle has no
cold-start lag (small always-on cost). Keep this flag on redeploys; to apply it
without a full redeploy: `gcloud run services update luxe-wholesale-portal --min-instances 1 --region us-central1 --project photography-964f5`.

Smoke: `/wholesale/sign-in` (buyer) and `/wholesaleportal/sign-in` (staff). Static SPA backup lives in `wholesaleportal-legacy/`.

## Daily cron — expire stale suggested lots & invoice requests

Active bundles hide their SKUs from the individual storefront. Lots older than **14 days** auto-archive so those SKUs return to sale.

Pending invoice requests (open/contacted) older than **7 days** are set to **timed_out**: holds release and any suggested lots on the request are deactivated.

Both run on the same Scheduler job:

1. Set a strong `CRON_SECRET` on Cloud Run (and locally in `.env` for testing).
2. Cloud Scheduler job `luxe-expire-bundles` (daily 6:00 America/New_York) POSTs:

`https://photography-964f5.web.app/api/cron/expire-bundles` with `Authorization: Bearer <CRON_SECRET>`

Local smoke: `curl -X POST "http://localhost:3000/api/cron/expire-bundles" -H "Authorization: Bearer $CRON_SECRET"`

## Feature map

| Reference (Next) | Live Firestore today | Status |
| --- | --- | --- |
| Invoice requests (`/rep`) | `salesPortalQuotes` (collection name unchanged to avoid a data migration; UI now says "invoice request", not "quote") | Wired |
| Clients (`/rep/clients`) | `salesPortalBuyers` | Wired |
| Catalog (`/rep/catalog`) | `uploadHistory` + IIQ + org catalogSelection | Wired |
| Bundles / formal invoices (`/rep/invoices`) / leads | Prisma only | Keep for new work |
| Buyer cart → "Submit for processing to invoice" | Firebase `/wholesale` storefront submits an invoice request; full Modify/Approve → formal invoice workflow is later cutover | In progress |

## Do not edit `reference-project/luxe-supply-co`

Treat it as the frozen brief. Active development is here.
