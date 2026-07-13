# Bridging ItemIQ Firebase portal → Next.js

This app (`luxe-supply-wholesale/`) is the Luxe Supply wholesale **buyer + staff** UI on Cloud Run.

| Surface | Prod URL | Data |
| --- | --- | --- |
| Buyer storefront | https://photography-964f5.web.app/wholesale | Next → Firestore buyers/catalog/cart/quotes |
| Staff portal | https://photography-964f5.web.app/wholesaleportal | Next → Firestore staff/quotes/clients/catalog |
| Invoices / fulfillment / leads (reference extras) | Prisma when used | Not required for catalog SoT |

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
  --set-env-vars "GCLOUD_PROJECT=photography-964f5,NODE_ENV=production,PUBLIC_HOST=photography-964f5.web.app"

cd ../ItemIQ-Marketing-Website
firebase deploy --only hosting
```

Smoke: `/wholesale/sign-in` (buyer) and `/wholesaleportal/sign-in` (staff). Static SPA backup lives in `wholesaleportal-legacy/`.

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
