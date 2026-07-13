/**
 * Sync LuxeSupply ItemIQ catalog (Firestore uploadHistory + IIQItemDetails)
 * into the Next.js Prisma Product table.
 *
 * Requires Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS
 * for project photography-964f5 (same as Cloud Functions).
 *
 * Usage (from luxe-supply-wholesale/):
 *   npx tsx scripts/sync-itemiq-catalog.ts
 */
import { PrismaClient } from "@prisma/client";
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const UPLOAD_DIRECTORY = "luxesupply";
const MAX_UPLOADS = 800;

const prisma = new PrismaClient();

function takeText(x: unknown): string {
  return x != null && String(x).trim() ? String(x).trim() : "";
}

function getIiqListingPrice(iiq: Record<string, unknown> | null): string {
  if (!iiq) return "";
  const sale = iiq["Sale Price"];
  if (sale != null && String(sale).trim() !== "") return String(sale).trim();
  const p = iiq.price;
  if (p != null && String(p).trim() !== "") return String(p).trim();
  return "";
}

function parseMoneyToInt(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function ensureAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "photography-964f5",
    });
  }
  return getFirestore();
}

async function loadIiqBySku(
  db: FirebaseFirestore.Firestore,
  skus: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const unique = [...new Set(skus.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const snaps = await Promise.all(
      chunk.map((sku) =>
        db
          .collection("IIQItemDetails")
          .where("sku", "==", sku)
          .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
          .limit(5)
          .get(),
      ),
    );
    snaps.forEach((snap, idx) => {
      if (snap.empty) return;
      let best: Record<string, unknown> | null = null;
      snap.forEach((doc) => {
        const data = doc.data() || {};
        if (!best) best = data;
        else if (data.claimedBy && !best.claimedBy) best = data;
      });
      if (best) map.set(chunk[idx], best);
    });
  }
  return map;
}

type Group = {
  sku: string;
  imageUrls: string[];
  brand: string;
  hostCompAvgUsd: number | null;
  titleHint: string;
};

function groupUploads(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Group[] {
  const grouped = new Map<string, Group>();
  docs.forEach((doc) => {
    const d = doc.data() || {};
    const sku = String(d.sku || "").trim();
    if (!sku) return;
    const key = `${sku}_${d.userEmail || ""}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        sku,
        imageUrls: [],
        brand: takeText(d.brand),
        hostCompAvgUsd: null,
        titleHint: takeText(d.metadata?.listingTitle || d.metadata?.title),
      });
    }
    const g = grouped.get(key)!;
    if (Array.isArray(d.imageUrls)) {
      d.imageUrls.forEach((url: string) => {
        if (url && !g.imageUrls.includes(url)) g.imageUrls.push(url);
      });
    }
    if (d.hostCompAvgUsd != null && Number.isFinite(Number(d.hostCompAvgUsd))) {
      g.hostCompAvgUsd = Number(d.hostCompAvgUsd);
    }
    if (!g.brand && takeText(d.brand)) g.brand = takeText(d.brand);
  });
  // Prefer one row per SKU (first wins after sort by most images)
  const bySku = new Map<string, Group>();
  [...grouped.values()]
    .sort((a, b) => b.imageUrls.length - a.imageUrls.length)
    .forEach((g) => {
      if (!bySku.has(g.sku)) bySku.set(g.sku, g);
    });
  return [...bySku.values()];
}

async function main() {
  ensureAdmin();
  const db = getFirestore();

  console.log(`Fetching uploadHistory for ${UPLOAD_DIRECTORY}…`);
  const uploadSnap = await db
    .collection("uploadHistory")
    .where("uploadDirectory", "==", UPLOAD_DIRECTORY)
    .limit(MAX_UPLOADS)
    .get();

  const groups = groupUploads(uploadSnap.docs);
  console.log(`Grouped ${groups.length} SKUs from ${uploadSnap.size} upload rows`);

  const iiqMap = await loadIiqBySku(
    db,
    groups.map((g) => g.sku),
  );

  let upserted = 0;
  let skipped = 0;

  for (const g of groups) {
    const iiq = iiqMap.get(g.sku) || null;
    const soldOut = !!(iiq && (iiq.sold === true || iiq.Sold === true));
    const priceRaw = getIiqListingPrice(iiq);
    const wholesalePrice = parseMoneyToInt(priceRaw);
    if (!wholesalePrice) {
      skipped += 1;
      // Still sync with $0 so the piece appears; staff can fix price later
    }

    const askTitle =
      takeText(iiq?.listingTitle) ||
      takeText(iiq?.productTitle) ||
      takeText(iiq?.name) ||
      g.titleHint ||
      g.sku;
    const brand =
      takeText(iiq?.brand) || g.brand || takeText(iiq?.Brand) || "LuxeSupply";
    const condition = takeText(iiq?.condition) || takeText(iiq?.Condition) || "See photos";
    const imageUrls = g.imageUrls.length ? g.imageUrls : [];
    const primaryImageUrl = imageUrls[0] || null;
    const hostComp =
      g.hostCompAvgUsd != null
        ? g.hostCompAvgUsd
        : iiq && iiq.hostCompAvgUsd != null && Number.isFinite(Number(iiq.hostCompAvgUsd))
          ? Number(iiq.hostCompAvgUsd)
          : null;

    const estLow =
      hostComp != null ? Math.round(hostComp * 0.85) : Math.max(wholesalePrice, 1);
    const estHigh =
      hostComp != null ? Math.round(hostComp * 1.35) : Math.max(wholesalePrice * 2, estLow + 1);

    const authProvider = takeText(iiq?.authenticationProvider).toLowerCase();
    const authenticated = !!(
      iiq?.authenticated === true ||
      iiq?.Authenticated === true ||
      authProvider
    );
    let authLabel = "";
    if (authenticated) {
      if (authProvider.includes("check")) authLabel = "Authenticated · CheckCheck";
      else if (authProvider.includes("real")) authLabel = "Authenticated · Real Authentication";
      else authLabel = "Authenticated";
    }

    await prisma.product.upsert({
      where: { sku: g.sku },
      create: {
        sku: g.sku,
        name: askTitle.slice(0, 200),
        brand: brand.slice(0, 120),
        category: takeText(iiq?.category) || "Imported",
        era: takeText(iiq?.era) || "Preowned",
        material: takeText(iiq?.material) || brand || "—",
        origin: takeText(iiq?.origin) || "LuxeSupply vault",
        wholesalePrice: wholesalePrice || 0,
        estRetailLow: estLow,
        estRetailHigh: estHigh,
        provenance: takeText(iiq?.provenance) || "Consigned via ItemIQ / LuxeSupply",
        condition,
        marks: takeText(iiq?.marks) || null,
        dimensions: takeText(iiq?.dimensions) || null,
        location: takeText(iiq?.storageLocation) || "VAULT · ITEMIQ",
        status: soldOut ? "SOLD" : "AVAILABLE",
        images: JSON.stringify(imageUrls.length ? imageUrls : [g.sku]),
        imageLabel: askTitle.slice(0, 80),
        primaryImageUrl,
        hostCompAvgUsd: hostComp,
        source: "itemiq",
        authenticated,
        authLabel: authLabel || null,
      },
      update: {
        name: askTitle.slice(0, 200),
        brand: brand.slice(0, 120),
        wholesalePrice: wholesalePrice || 0,
        estRetailLow: estLow,
        estRetailHigh: estHigh,
        condition,
        location: takeText(iiq?.storageLocation) || "VAULT · ITEMIQ",
        status: soldOut ? "SOLD" : "AVAILABLE",
        images: JSON.stringify(imageUrls.length ? imageUrls : [g.sku]),
        imageLabel: askTitle.slice(0, 80),
        primaryImageUrl,
        hostCompAvgUsd: hostComp,
        source: "itemiq",
        authenticated,
        authLabel: authLabel || null,
        material: takeText(iiq?.material) || brand || "—",
      },
    });
    upserted += 1;
  }

  console.log(`Done. Upserted ${upserted} products (${skipped} had no parseable price).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
