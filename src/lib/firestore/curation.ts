import { randomBytes } from "crypto";
import { getDb, toIso } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { resolveCurationItems, type CurationDraftItem } from "./catalog";

const COLLECTION = "curationShareSessions";
const MIN_EXPIRES_HOURS = 1;
const MAX_EXPIRES_HOURS = 12;
const DEFAULT_EXPIRES_HOURS = 4;
const MAX_ITEMS = 200;

export type CurationDecision = "" | "approve" | "maybe" | "decline";

export type CurationItem = {
  sku: string;
  title: string;
  brand: string;
  condition: string;
  /** Staff-only — stripped from buyer-facing responses. */
  cost: number | null;
  price: number;
  imageUrl: string | null;
  imageUrls: string[];
  decision: CurationDecision;
  note: string;
  liveAdded?: boolean;
};

export type CurationShare = {
  token: string;
  clientName: string;
  invoiceDate: string;
  note: string;
  createdByEmail: string;
  createdByDisplayName: string;
  items: CurationItem[];
  itemCount: number;
  heroSku: string | null;
  sessionEnded: boolean;
  revoked: boolean;
  revision: number;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CurationSummary = {
  itemCount: number;
  approve: number;
  maybe: number;
  decline: number;
  pending: number;
  cartTotal: number;
};

function takeText(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function normalizeDecision(raw: unknown): CurationDecision {
  const s = takeText(raw).toLowerCase();
  return s === "approve" || s === "maybe" || s === "decline" ? (s as CurationDecision) : "";
}

function clampExpiresHours(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_EXPIRES_HOURS;
  return Math.min(MAX_EXPIRES_HOURS, Math.max(MIN_EXPIRES_HOURS, Math.round(n)));
}

function serializeItem(raw: Record<string, unknown>): CurationItem {
  const priceRaw = Number(raw.price);
  return {
    sku: takeText(raw.sku),
    title: takeText(raw.title) || takeText(raw.sku),
    brand: takeText(raw.brand),
    condition: takeText(raw.condition),
    cost:
      typeof raw.cost === "number" && Number.isFinite(raw.cost) ? Math.round(raw.cost) : null,
    price: Number.isFinite(priceRaw) ? Math.max(0, Math.round(priceRaw)) : 0,
    imageUrl: raw.imageUrl ? takeText(raw.imageUrl) : null,
    imageUrls: Array.isArray(raw.imageUrls) ? raw.imageUrls.map(takeText).filter(Boolean) : [],
    decision: normalizeDecision(raw.decision),
    note: takeText(raw.note).slice(0, 500),
    liveAdded: raw.liveAdded === true,
  };
}

function stripCost(item: CurationItem): CurationItem {
  return { ...item, cost: null };
}

function serializeShare(id: string, d: Record<string, unknown>, opts?: { includeCost?: boolean }): CurationShare {
  const rawItems = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
  const items = rawItems.map(serializeItem).map((it) => (opts?.includeCost ? it : stripCost(it)));
  return {
    token: id,
    clientName: takeText(d.clientName),
    invoiceDate: takeText(d.invoiceDate),
    note: takeText(d.note),
    createdByEmail: takeText(d.createdByEmail),
    createdByDisplayName: takeText(d.createdByDisplayName),
    items,
    itemCount: items.length,
    heroSku: d.heroSku ? takeText(d.heroSku) : null,
    sessionEnded: d.sessionEnded === true,
    revoked: d.revoked === true,
    revision: typeof d.revision === "number" ? d.revision : 0,
    expiresAt: toIso(d.expiresAt),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

function isExpired(d: Record<string, unknown>): boolean {
  const expiresAt = d.expiresAt;
  if (!expiresAt || typeof (expiresAt as { toDate?: () => Date }).toDate !== "function") {
    return false;
  }
  return (expiresAt as { toDate: () => Date }).toDate().getTime() <= Date.now();
}

function assertShareWritable(d: Record<string, unknown>): void {
  if (d.revoked === true) throw new Error("This curation link has been revoked.");
  if (isExpired(d)) throw new Error("This curation link has expired.");
  if (d.sessionEnded === true) throw new Error("This session has ended and is now read-only.");
}

/** Resolve pasted SKUs into review rows for the builder screen. */
export async function resolveCurationSkusForBuilder(
  skusRaw: string[],
): Promise<{ items: CurationDraftItem[]; missing: string[] }> {
  const skus = skusRaw.map((s) => String(s || "").trim()).filter(Boolean);
  if (skus.length > MAX_ITEMS) {
    throw new Error(`Paste ${MAX_ITEMS} SKUs or fewer at a time.`);
  }
  return resolveCurationItems(skus);
}

/** Create a new curation share from reviewed builder rows. */
export async function createCurationShare(opts: {
  items: Array<{
    sku: string;
    title?: string;
    brand?: string;
    condition?: string;
    cost?: number | null;
    price: number;
    imageUrl?: string | null;
    imageUrls?: string[];
  }>;
  clientName?: string;
  invoiceDate?: string;
  note?: string;
  expiresHours?: number;
  createdByEmail: string;
  createdByDisplayName: string;
}): Promise<CurationShare> {
  const seen = new Set<string>();
  const items = opts.items
    .map((it) => ({
      sku: takeText(it.sku),
      title: takeText(it.title) || takeText(it.sku),
      brand: takeText(it.brand),
      condition: takeText(it.condition),
      cost:
        it.cost != null && Number.isFinite(Number(it.cost)) ? Math.round(Number(it.cost)) : null,
      price: Number.isFinite(Number(it.price)) ? Math.max(0, Math.round(Number(it.price))) : 0,
      imageUrl: it.imageUrl ? takeText(it.imageUrl) : null,
      imageUrls: Array.isArray(it.imageUrls) ? it.imageUrls.map(takeText).filter(Boolean) : [],
      decision: "" as CurationDecision,
      note: "",
    }))
    .filter((it) => {
      if (!it.sku) return false;
      const key = it.sku.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS);

  if (!items.length) throw new Error("Add at least one priced item before sharing.");

  const org = await getLuxesupplyOrg();
  const token = generateToken();
  const now = new Date();
  const expiresHours = clampExpiresHours(opts.expiresHours);
  const expiresAt = new Date(now.getTime() + expiresHours * 60 * 60 * 1000);

  const doc = {
    organizationId: org.id,
    orgSlug: "luxesupply",
    createdByEmail: opts.createdByEmail,
    createdByDisplayName: opts.createdByDisplayName,
    clientName: takeText(opts.clientName),
    invoiceDate: takeText(opts.invoiceDate),
    note: takeText(opts.note).slice(0, 500),
    items,
    itemCount: items.length,
    heroSku: null,
    sessionEnded: false,
    revoked: false,
    revision: 1,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };

  await getDb().collection(COLLECTION).doc(token).set(doc);
  return serializeShare(token, doc, { includeCost: true });
}

/** Active (not revoked, not expired) shares for this org, newest first. */
export async function listActiveCurationShares(limit = 20): Promise<CurationShare[]> {
  const org = await getLuxesupplyOrg();
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection(COLLECTION)
      .where("organizationId", "==", org.id)
      .where("revoked", "==", false)
      .orderBy("createdAt", "desc")
      .limit(Math.min(Math.max(limit, 1), 50))
      .get();
  } catch {
    snap = await db
      .collection(COLLECTION)
      .where("organizationId", "==", org.id)
      .limit(50)
      .get();
  }

  const now = Date.now();
  return snap.docs
    .map((doc) => ({ id: doc.id, d: doc.data() || {} }))
    .filter(({ d }) => d.revoked !== true)
    .filter(({ d }) => {
      const expiresAt = d.expiresAt;
      if (!expiresAt || typeof (expiresAt as { toDate?: () => Date }).toDate !== "function") {
        return true;
      }
      return (expiresAt as { toDate: () => Date }).toDate().getTime() > now;
    })
    .map(({ id, d }) => serializeShare(id, d, { includeCost: true }))
    .slice(0, limit);
}

async function loadDoc(token: string) {
  const clean = takeText(token);
  if (!clean || clean.length < 16 || clean.length > 80 || !/^[A-Za-z0-9_-]+$/.test(clean)) {
    return null;
  }
  const ref = getDb().collection(COLLECTION).doc(clean);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { ref, data: snap.data() || {} };
}

/** Staff detail fetch — includes cost, does not enforce the buyer read guards. */
export async function getCurationShareForStaff(token: string): Promise<CurationShare | null> {
  const found = await loadDoc(token);
  if (!found) return null;
  return serializeShare(token, found.data, { includeCost: true });
}

/** Public buyer fetch — no cost, hides revoked/expired shares (not-found, no enumeration). */
export async function getCurationShareForBuyer(token: string): Promise<CurationShare | null> {
  const found = await loadDoc(token);
  if (!found) return null;
  const { data } = found;
  if (data.revoked === true || isExpired(data)) return null;
  return serializeShare(token, data, { includeCost: false });
}

async function updateItemField(
  token: string,
  sku: string,
  mutate: (item: Record<string, unknown>) => Record<string, unknown>,
  opts?: { requireWritable?: boolean; setHero?: boolean },
): Promise<{ revision: number; heroSku: string | null }> {
  const found = await loadDoc(token);
  if (!found) throw new Error("This curation link is unavailable.");
  const { ref, data } = found;
  if (opts?.requireWritable !== false) assertShareWritable(data);

  const skuKey = takeText(sku).toLowerCase();
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  let found2 = false;
  const nextItems = items.map((it) => {
    if (takeText(it.sku).toLowerCase() !== skuKey) return it;
    found2 = true;
    return mutate(it);
  });
  if (!found2) throw new Error("That item is not on this curation link.");

  const revision = (typeof data.revision === "number" ? data.revision : 0) + 1;
  const heroSku = opts?.setHero ? takeText(sku) : data.heroSku ? takeText(data.heroSku) : null;
  await ref.update({
    items: nextItems,
    revision,
    updatedAt: new Date(),
    ...(opts?.setHero ? { heroSku: takeText(sku) } : {}),
  });
  return { revision, heroSku };
}

/** Public: buyer or staff sets a decision. Blocked once the session has ended/expired/revoked. */
export async function updateCurationDecision(
  token: string,
  sku: string,
  decisionRaw: string,
): Promise<{ revision: number; decision: CurationDecision }> {
  const decision = normalizeDecision(decisionRaw);
  const { revision } = await updateItemField(token, sku, (it) => ({ ...it, decision }));
  return { revision, decision };
}

/** Public: buyer or staff sets an invoice note on an item (≤500 chars). */
export async function updateCurationNote(
  token: string,
  sku: string,
  noteRaw: string,
): Promise<{ revision: number }> {
  const note = takeText(noteRaw).slice(0, 500);
  const { revision } = await updateItemField(token, sku, (it) => ({ ...it, note }));
  return { revision };
}

/** Staff-only: adjust a listed price mid-session. */
export async function updateCurationPrice(
  token: string,
  sku: string,
  priceRaw: number,
): Promise<{ revision: number }> {
  const price = Number.isFinite(Number(priceRaw)) ? Math.max(0, Math.round(Number(priceRaw))) : 0;
  const { revision } = await updateItemField(token, sku, (it) => ({ ...it, price }));
  return { revision };
}

/** Staff-only: live-add a SKU mid-call; sets it as the buyer's featured/hero item. */
export async function addCurationItem(
  token: string,
  item: {
    sku: string;
    title?: string;
    brand?: string;
    condition?: string;
    cost?: number | null;
    price: number;
    imageUrl?: string | null;
    imageUrls?: string[];
  },
): Promise<{ revision: number; itemCount: number }> {
  const found = await loadDoc(token);
  if (!found) throw new Error("This curation link is unavailable.");
  const { ref, data } = found;
  assertShareWritable(data);

  const sku = takeText(item.sku);
  if (!sku) throw new Error("Missing SKU.");
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  if (items.length >= MAX_ITEMS) throw new Error(`This link is already at the ${MAX_ITEMS}-item limit.`);
  const skuKey = sku.toLowerCase();
  if (items.some((it) => takeText(it.sku).toLowerCase() === skuKey)) {
    throw new Error("That SKU is already on this curation link.");
  }

  const newItem = {
    sku,
    title: takeText(item.title) || sku,
    brand: takeText(item.brand),
    condition: takeText(item.condition),
    cost:
      item.cost != null && Number.isFinite(Number(item.cost)) ? Math.round(Number(item.cost)) : null,
    price: Number.isFinite(Number(item.price)) ? Math.max(0, Math.round(Number(item.price))) : 0,
    imageUrl: item.imageUrl ? takeText(item.imageUrl) : null,
    imageUrls: Array.isArray(item.imageUrls) ? item.imageUrls.map(takeText).filter(Boolean) : [],
    decision: "",
    note: "",
    liveAdded: true,
  };

  const nextItems = [...items, newItem];
  const revision = (typeof data.revision === "number" ? data.revision : 0) + 1;
  await ref.update({
    items: nextItems,
    itemCount: nextItems.length,
    heroSku: sku,
    revision,
    updatedAt: new Date(),
  });
  return { revision, itemCount: nextItems.length };
}

/** Staff-only: remove an item from the link (e.g. wrong SKU, mis-priced). */
export async function removeCurationItem(
  token: string,
  sku: string,
): Promise<{ revision: number; itemCount: number }> {
  const found = await loadDoc(token);
  if (!found) throw new Error("This curation link is unavailable.");
  const { ref, data } = found;
  assertShareWritable(data);

  const skuKey = takeText(sku).toLowerCase();
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const nextItems = items.filter((it) => takeText(it.sku).toLowerCase() !== skuKey);
  if (nextItems.length === items.length) {
    throw new Error("That item is not on this curation link.");
  }

  const revision = (typeof data.revision === "number" ? data.revision : 0) + 1;
  const heroSku =
    data.heroSku && takeText(data.heroSku).toLowerCase() === skuKey
      ? null
      : (data.heroSku as string | null) ?? null;
  await ref.update({
    items: nextItems,
    itemCount: nextItems.length,
    heroSku,
    revision,
    updatedAt: new Date(),
  });
  return { revision, itemCount: nextItems.length };
}

/** Staff-only: update client name / invoice date / note mid-session. */
export async function updateCurationMeta(
  token: string,
  opts: { clientName?: string; invoiceDate?: string; note?: string },
): Promise<{ revision: number }> {
  const found = await loadDoc(token);
  if (!found) throw new Error("This curation link is unavailable.");
  const { ref, data } = found;
  assertShareWritable(data);

  const revision = (typeof data.revision === "number" ? data.revision : 0) + 1;
  const patch: Record<string, unknown> = { revision, updatedAt: new Date() };
  if (opts.clientName !== undefined) patch.clientName = takeText(opts.clientName).slice(0, 160);
  if (opts.invoiceDate !== undefined) patch.invoiceDate = takeText(opts.invoiceDate).slice(0, 40);
  if (opts.note !== undefined) patch.note = takeText(opts.note).slice(0, 500);
  await ref.update(patch);
  return { revision };
}

function summarize(items: CurationItem[]): CurationSummary {
  let approve = 0;
  let maybe = 0;
  let decline = 0;
  let pending = 0;
  let cartTotal = 0;
  for (const it of items) {
    if (it.decision === "approve") {
      approve += 1;
      cartTotal += it.price;
    } else if (it.decision === "maybe") maybe += 1;
    else if (it.decision === "decline") decline += 1;
    else pending += 1;
  }
  return { itemCount: items.length, approve, maybe, decline, pending, cartTotal };
}

/** Staff-only: end the live session — buyer becomes read-only; hero clears. */
export async function endCurationSession(
  token: string,
): Promise<{ revision: number; summary: CurationSummary }> {
  const found = await loadDoc(token);
  if (!found) throw new Error("This curation link is unavailable.");
  const { ref, data } = found;
  if (data.revoked === true) throw new Error("This curation link has been revoked.");
  if (data.sessionEnded === true) throw new Error("This session has already ended.");

  const items = (Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : []).map(
    serializeItem,
  );
  const summary = summarize(items);
  const revision = (typeof data.revision === "number" ? data.revision : 0) + 1;
  await ref.update({
    sessionEnded: true,
    sessionEndedAt: new Date(),
    heroSku: null,
    revision,
    updatedAt: new Date(),
  });
  return { revision, summary };
}

/** Staff-only: immediately revoke — public reads/writes stop resolving this token. */
export async function revokeCurationShare(token: string): Promise<{ revoked: true }> {
  const found = await loadDoc(token);
  if (!found) throw new Error("This curation link is unavailable.");
  await found.ref.update({ revoked: true, revokedAt: new Date(), updatedAt: new Date() });
  return { revoked: true };
}
