// Pack-and-ship records for invoices — one doc per invoice in
// `salesPortalFulfillment`. Scan-driven flow (barcode scanners type + Enter):
// scan a box barcode to open/select a box, scan item SKUs into the current
// box. Every scan is timestamped; bad scans (unknown SKU, no box selected,
// already boxed) are logged as errors per the ops requirement. Each box gets
// its own carrier + tracking number; completing marks the invoice SHIPPED.
import { getDb, toIso } from "./admin";
import { getLuxesupplyOrg } from "./staff";
import { getInvoiceById, type PortalInvoice } from "./invoices";
import { getQuoteById, expandQuoteItemSkus } from "./quotes";
import { getStaffProductBaseBySku } from "./catalog";

const COLLECTION = "salesPortalFulfillment";
const MAX_SCANS = 800;

export type FulfillmentBox = {
  id: string;
  /** Ordinal label per the meeting convention: "-1", "-2" suffix boxes. */
  label: string;
  barcode: string;
  carrier: string;
  trackingNumber: string;
  createdAt: string | null;
  /** Parcel details for rate shopping (ShipEngine). */
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  /** Purchased label (ShipEngine) — pdf/zpl URLs for printing. */
  labelId: string | null;
  labelPdfUrl: string | null;
  labelZplUrl: string | null;
  labelCost: number | null;
  labelService: string | null;
  /** Latest carrier tracking status (webhook-fed), e.g. "In Transit", "Delivered". */
  trackingStatus: string | null;
  trackingStatusAt: string | null;
};

export type FulfillmentScan = {
  at: string | null;
  by: string;
  code: string;
  kind: "box" | "item" | "error";
  boxId: string | null;
  error: string | null;
};

export type FulfillmentRecord = {
  invoiceId: string;
  invoiceNumber: string;
  portalUsername: string;
  status: "packing" | "shipped";
  /** SKUs expected on this shipment (lot lines expanded to member pieces). */
  expectedSkus: string[];
  /** sku -> boxId */
  assignments: Record<string, string>;
  boxes: FulfillmentBox[];
  scans: FulfillmentScan[];
  createdAt: string | null;
  updatedAt: string | null;
  shippedAt: string | null;
  shippedBy: string;
};

function serialize(d: Record<string, unknown>): FulfillmentRecord {
  return {
    invoiceId: String(d.invoiceId || ""),
    invoiceNumber: String(d.invoiceNumber || ""),
    portalUsername: String(d.portalUsername || ""),
    status: String(d.status || "packing") === "shipped" ? "shipped" : "packing",
    expectedSkus: Array.isArray(d.expectedSkus) ? d.expectedSkus.map((s) => String(s)) : [],
    assignments:
      d.assignments && typeof d.assignments === "object"
        ? Object.fromEntries(
            Object.entries(d.assignments as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
          )
        : {},
    boxes: (Array.isArray(d.boxes) ? (d.boxes as Array<Record<string, unknown>>) : []).map((b) => {
      const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
      return {
        id: String(b.id || ""),
        label: String(b.label || ""),
        barcode: String(b.barcode || ""),
        carrier: String(b.carrier || ""),
        trackingNumber: String(b.trackingNumber || ""),
        createdAt: toIso(b.createdAt),
        weightOz: num(b.weightOz),
        lengthIn: num(b.lengthIn),
        widthIn: num(b.widthIn),
        heightIn: num(b.heightIn),
        labelId: b.labelId ? String(b.labelId) : null,
        labelPdfUrl: b.labelPdfUrl ? String(b.labelPdfUrl) : null,
        labelZplUrl: b.labelZplUrl ? String(b.labelZplUrl) : null,
        labelCost: Number.isFinite(Number(b.labelCost)) ? Number(b.labelCost) : null,
        labelService: b.labelService ? String(b.labelService) : null,
        trackingStatus: b.trackingStatus ? String(b.trackingStatus) : null,
        trackingStatusAt: toIso(b.trackingStatusAt),
      };
    }),
    scans: (Array.isArray(d.scans) ? (d.scans as Array<Record<string, unknown>>) : []).map((s) => ({
      at: toIso(s.at),
      by: String(s.by || ""),
      code: String(s.code || ""),
      kind: (["box", "item", "error"].includes(String(s.kind)) ? String(s.kind) : "error") as
        | "box"
        | "item"
        | "error",
      boxId: s.boxId ? String(s.boxId) : null,
      error: s.error ? String(s.error) : null,
    })),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    shippedAt: toIso(d.shippedAt),
    shippedBy: String(d.shippedBy || ""),
  };
}

/** Expected physical pieces: expand suggested-lot lines to member SKUs via the linked quote. */
async function expectedSkusForInvoice(invoice: PortalInvoice): Promise<string[]> {
  try {
    if (invoice.quoteId) {
      const quote = await getQuoteById(invoice.quoteId);
      if (quote) {
        const skus = quote.items.flatMap((it) => expandQuoteItemSkus(it));
        if (skus.length) return [...new Set(skus)];
      }
    }
  } catch {
    // fall through to invoice lines
  }
  return [...new Set(invoice.items.map((i) => i.sku).filter(Boolean))];
}

export async function getOrCreateFulfillment(invoiceId: string): Promise<{
  record: FulfillmentRecord;
  invoice: PortalInvoice;
}> {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw new Error("Invoice not found.");

  const ref = getDb().collection(COLLECTION).doc(invoiceId);
  const snap = await ref.get();
  if (snap.exists) return { record: serialize(snap.data() || {}), invoice };

  const org = await getLuxesupplyOrg();
  const now = new Date();
  const doc = {
    organizationId: org.id,
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    portalUsername: invoice.portalUsername,
    status: "packing",
    expectedSkus: await expectedSkusForInvoice(invoice),
    assignments: {},
    boxes: [],
    scans: [],
    createdAt: now,
    updatedAt: now,
    shippedAt: null,
    shippedBy: "",
  };
  await ref.set(doc);
  return { record: serialize(doc as unknown as Record<string, unknown>), invoice };
}

/** Read-only lookup (no lazy create) — for staff views that only report on packing. */
export async function getFulfillmentRecord(invoiceId: string): Promise<FulfillmentRecord | null> {
  if (!invoiceId) return null;
  const snap = await getDb().collection(COLLECTION).doc(invoiceId).get();
  if (!snap.exists) return null;
  return serialize(snap.data() || {});
}

export type ScanResult = {
  record: FulfillmentRecord;
  outcome: "box_selected" | "box_created" | "item_assigned" | "error";
  message: string;
  currentBoxId: string | null;
  /** Wrong-piece scan (item not on this order) — the console shows a blocking stop alert. */
  stop?: boolean;
};

/** Barcodes that open a NEW box must carry this prefix (printed box labels use it). */
const BOX_BARCODE_PREFIX = /^BOX[-_ ]/i;

/**
 * Process one scan. Rules:
 * - code matches an expected SKU  -> assign to the current box (error if none
 *   selected or already boxed — both logged)
 * - code matches an existing box barcode -> select that box
 * - anything else -> STOP error. Scanning NEVER creates boxes (per meeting:
 *   box setup happens before packing, via "+ New box" + printed labels).
 *   A BOX- code that isn't on this shipment is most likely another invoice's
 *   box label — silently creating a box here would cross two shipments.
 */
export async function recordScan(
  invoiceId: string,
  code: string,
  currentBoxId: string | null,
  by: string,
): Promise<ScanResult> {
  const cleaned = String(code || "").trim();
  if (!cleaned) throw new Error("Empty scan.");

  const db = getDb();
  const ref = db.collection(COLLECTION).doc(invoiceId);
  const upper = cleaned.toUpperCase();

  // Wrong-piece guard (outside the transaction — catalog reads mustn't rerun on
  // contention): an unknown code that resolves to a real catalog SKU is almost
  // always the wrong piece on the bench, never a box barcode.
  const preSnap = await ref.get();
  if (!preSnap.exists) throw new Error("Open the shipment before scanning.");
  const pre = serialize(preSnap.data() || {});
  let unknownIsCatalogSku = false;
  if (
    !pre.expectedSkus.some((s) => s.toUpperCase() === upper) &&
    !pre.boxes.some((b) => b.barcode.toUpperCase() === upper)
  ) {
    unknownIsCatalogSku = !!(await getStaffProductBaseBySku(cleaned).catch(() => null));
  }

  // Transactional apply — two scan guns (or two stations on one invoice) racing
  // must not drop each other's assignments.
  const applied = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Open the shipment before scanning.");
    const record = serialize(snap.data() || {});
    if (record.status === "shipped") throw new Error("This shipment is already marked shipped.");

    const now = new Date();
    const matchedSku = record.expectedSkus.find((s) => s.toUpperCase() === upper) || null;
    const matchedBox = record.boxes.find((b) => b.barcode.toUpperCase() === upper) || null;

    let outcome: ScanResult["outcome"];
    let message: string;
    let stop = false;
    let nextCurrentBoxId = currentBoxId;
    const scans = [
      ...record.scans.slice(-(MAX_SCANS - 1)).map((s) => ({ ...s, at: s.at ? new Date(s.at) : now })),
    ];
    const boxes = [...record.boxes.map((b) => ({ ...b, createdAt: b.createdAt ? new Date(b.createdAt) : now }))];
    const assignments = { ...record.assignments };

    if (matchedSku) {
      const already = assignments[matchedSku];
      if (!currentBoxId || !boxes.some((b) => b.id === currentBoxId)) {
        outcome = "error";
        message = `${matchedSku}: scanned without a box — scan a box barcode first.`;
        scans.push({ at: now, by, code: cleaned, kind: "error", boxId: null, error: message });
      } else if (already && already === currentBoxId) {
        outcome = "error";
        message = `${matchedSku} is already in this box.`;
        scans.push({ at: now, by, code: cleaned, kind: "error", boxId: currentBoxId, error: message });
      } else {
        const moved = already ? ` (moved from ${boxes.find((b) => b.id === already)?.label || "another box"})` : "";
        assignments[matchedSku] = currentBoxId;
        outcome = "item_assigned";
        message = `${matchedSku} → ${boxes.find((b) => b.id === currentBoxId)?.label || "box"}${moved}`;
        scans.push({ at: now, by, code: cleaned, kind: "item", boxId: currentBoxId, error: null });
      }
    } else if (matchedBox) {
      nextCurrentBoxId = matchedBox.id;
      outcome = "box_selected";
      message = `Box ${matchedBox.label} selected.`;
      scans.push({ at: now, by, code: cleaned, kind: "box", boxId: matchedBox.id, error: null });
    } else if (unknownIsCatalogSku) {
      outcome = "error";
      stop = true;
      message = `${cleaned} is not on this order — wrong piece. Do not pack it.`;
      scans.push({ at: now, by, code: cleaned, kind: "error", boxId: null, error: message });
    } else if (BOX_BARCODE_PREFIX.test(cleaned)) {
      // A box label that isn't one of THIS shipment's boxes — most likely a
      // label from a different invoice. Never auto-create a box from a scan:
      // box setup is its own step ("+ New box" + printed labels) before packing.
      outcome = "error";
      stop = true;
      message = `“${cleaned}” isn't one of this shipment's boxes — check that the label belongs to this invoice. Add boxes with “+ New box”, then print and scan its labels.`;
      scans.push({ at: now, by, code: cleaned, kind: "error", boxId: null, error: message });
    } else {
      outcome = "error";
      stop = true;
      message = `“${cleaned}” isn't on this order — check the piece. (Boxes are set up with “+ New box”, then selected by scanning their printed labels.)`;
      scans.push({ at: now, by, code: cleaned, kind: "error", boxId: null, error: message });
    }

    tx.update(ref, { scans, boxes, assignments, updatedAt: now });
    return { outcome, message, stop, nextCurrentBoxId };
  });

  const saved = await ref.get();
  return {
    record: serialize(saved.data() || {}),
    outcome: applied.outcome,
    message: applied.message,
    stop: applied.stop,
    currentBoxId: applied.nextCurrentBoxId,
  };
}

/**
 * Explicit new box (the “+ New box” button) — barcode is generated with the
 * BOX- prefix and printed on the box ID label, so scanning that label later
 * re-selects the box. Scanning arbitrary codes never creates boxes.
 */
export async function createBox(
  invoiceId: string,
  by: string,
): Promise<{ record: FulfillmentRecord; boxId: string }> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(invoiceId);
  const boxId = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Open the shipment before adding boxes.");
    const record = serialize(snap.data() || {});
    if (record.status === "shipped") throw new Error("This shipment is already marked shipped.");

    const now = new Date();
    const maxLabel = record.boxes.reduce(
      (m, b) => Math.max(m, Math.abs(parseInt(b.label, 10)) || 0),
      0,
    );
    const n = maxLabel + 1;
    const invoiceRef = (record.invoiceNumber || invoiceId).replace(/[^A-Za-z0-9-]+/g, "").toUpperCase();
    const box = {
      id: `box_${n}_${Math.random().toString(36).slice(2, 8)}`,
      label: `-${n}`,
      barcode: `BOX-${invoiceRef}-${n}`,
      carrier: "",
      trackingNumber: "",
      createdAt: now,
      weightOz: null,
      lengthIn: null,
      widthIn: null,
      heightIn: null,
      labelId: null,
      labelPdfUrl: null,
      labelZplUrl: null,
      labelCost: null,
      labelService: null,
      trackingStatus: null,
      trackingStatusAt: null,
    };
    const boxes = [
      ...record.boxes.map((b) => ({ ...b, createdAt: b.createdAt ? new Date(b.createdAt) : now })),
      box,
    ];
    const scans = [
      ...record.scans.slice(-(MAX_SCANS - 1)).map((s) => ({ ...s, at: s.at ? new Date(s.at) : now })),
      { at: now, by, code: box.barcode, kind: "box" as const, boxId: box.id, error: null },
    ];
    tx.update(ref, { boxes, scans, updatedAt: now });
    return box.id;
  });
  const saved = await ref.get();
  return { record: serialize(saved.data() || {}), boxId };
}

export async function setBoxTracking(
  invoiceId: string,
  boxId: string,
  tracking: { carrier: string; trackingNumber: string },
): Promise<FulfillmentRecord> {
  return updateBox(invoiceId, boxId, {
    carrier: String(tracking.carrier || "").trim().slice(0, 40),
    trackingNumber: String(tracking.trackingNumber || "").trim().slice(0, 80),
  });
}

/**
 * Transactional per-box patch — parcel auto-saves fire for several boxes at
 * once (and stations can race each other), so a read-modify-write here would
 * silently drop one box's update.
 */
async function updateBox(
  invoiceId: string,
  boxId: string,
  patch: Record<string, unknown>,
): Promise<FulfillmentRecord> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(invoiceId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Shipment not found.");
    const record = serialize(snap.data() || {});
    if (!record.boxes.some((b) => b.id === boxId)) throw new Error("Box not found.");
    const boxes = record.boxes.map((b) =>
      b.id === boxId
        ? { ...b, ...patch, createdAt: b.createdAt ? new Date(b.createdAt) : new Date() }
        : { ...b, createdAt: b.createdAt ? new Date(b.createdAt) : new Date() },
    );
    tx.update(ref, {
      boxes,
      // Query index for the tracking webhook (nested array fields aren't queryable).
      trackingNumbers: boxes.map((b) => b.trackingNumber).filter(Boolean),
      updatedAt: new Date(),
    });
  });
  const saved = await ref.get();
  return serialize(saved.data() || {});
}

/** Webhook-fed: stamp the latest carrier status onto whichever box owns the tracking number. */
/** Webhook-stored per-box status → "this box has been delivered". The webhook
 * stores status_description/status_code, so match both vocabularies. */
export function isDeliveredTrackingStatus(status: string | null): boolean {
  const s = String(status || "").trim().toUpperCase();
  return s === "DE" || s.includes("DELIVERED");
}

/** Every packed box on a shipped record reports delivered — drives the buyer's DELIVERED pill. */
export function fulfillmentDelivered(record: FulfillmentRecord | null): boolean {
  if (!record || record.status !== "shipped") return false;
  const usedBoxIds = new Set(Object.values(record.assignments));
  const used = record.boxes.filter((b) => usedBoxIds.has(b.id));
  return used.length > 0 && used.every((b) => isDeliveredTrackingStatus(b.trackingStatus));
}

export async function updateTrackingStatusByNumber(
  trackingNumber: string,
  status: string,
): Promise<boolean> {
  const tn = String(trackingNumber || "").trim();
  if (!tn || !status) return false;
  const snap = await getDb()
    .collection(COLLECTION)
    .where("trackingNumbers", "array-contains", tn)
    .limit(1)
    .get();
  if (snap.empty) return false;
  const doc = snap.docs[0]!;
  const record = serialize(doc.data() || {});
  const boxes = record.boxes.map((b) => ({
    ...b,
    createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
    ...(b.trackingNumber === tn
      ? { trackingStatus: String(status).slice(0, 80), trackingStatusAt: new Date() }
      : {}),
  }));
  await doc.ref.update({ boxes, updatedAt: new Date() });
  return true;
}

/** Save a box's parcel details (weight/dims) ahead of rate shopping. */
export async function setBoxParcel(
  invoiceId: string,
  boxId: string,
  parcel: { weightOz: number; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null },
): Promise<FulfillmentRecord> {
  const weightOz = Number(parcel.weightOz);
  if (!Number.isFinite(weightOz) || weightOz <= 0) throw new Error("Enter the box weight (oz).");
  const dim = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return updateBox(invoiceId, boxId, {
    weightOz: Math.round(weightOz),
    lengthIn: dim(parcel.lengthIn),
    widthIn: dim(parcel.widthIn),
    heightIn: dim(parcel.heightIn),
  });
}

/** Attach a purchased ShipEngine label — fills carrier + tracking automatically. */
export async function attachLabelToBox(
  invoiceId: string,
  boxId: string,
  label: {
    labelId: string;
    trackingNumber: string;
    carrier: string;
    service: string;
    cost: number;
    pdfUrl: string;
    zplUrl: string;
  },
): Promise<FulfillmentRecord> {
  return updateBox(invoiceId, boxId, {
    carrier: label.carrier,
    trackingNumber: label.trackingNumber,
    labelId: label.labelId,
    labelPdfUrl: label.pdfUrl,
    labelZplUrl: label.zplUrl,
    labelCost: label.cost,
    labelService: label.service,
  });
}

/** Remove an empty box (mis-scan). Boxes with items must be emptied first. */
export async function removeBox(invoiceId: string, boxId: string): Promise<FulfillmentRecord> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(invoiceId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Shipment not found.");
    const record = serialize(snap.data() || {});
    if (Object.values(record.assignments).includes(boxId)) {
      throw new Error("Box has items in it — move them first.");
    }
    const boxes = record.boxes
      .filter((b) => b.id !== boxId)
      .map((b) => ({ ...b, createdAt: b.createdAt ? new Date(b.createdAt) : new Date() }));
    tx.update(ref, { boxes, updatedAt: new Date() });
  });
  const saved = await ref.get();
  return serialize(saved.data() || {});
}

/** Void support: strip a purchased label (and its tracking) so the box can re-quote. */
export async function clearLabelFromBox(invoiceId: string, boxId: string): Promise<FulfillmentRecord> {
  return updateBox(invoiceId, boxId, {
    carrier: "",
    trackingNumber: "",
    labelId: null,
    labelPdfUrl: null,
    labelZplUrl: null,
    labelCost: null,
    labelService: null,
    trackingStatus: null,
    trackingStatusAt: null,
  });
}

export function fulfillmentReadyToShip(record: FulfillmentRecord): { ready: boolean; reason: string | null } {
  const unassigned = record.expectedSkus.filter((s) => !record.assignments[s]);
  if (unassigned.length) {
    return { ready: false, reason: `${unassigned.length} piece${unassigned.length === 1 ? "" : "s"} not boxed yet.` };
  }
  const usedBoxIds = new Set(Object.values(record.assignments));
  const missingTracking = record.boxes.filter((b) => usedBoxIds.has(b.id) && !b.trackingNumber);
  if (missingTracking.length) {
    return {
      ready: false,
      reason: `Tracking number missing on ${missingTracking.map((b) => b.label).join(", ")}.`,
    };
  }
  if (!usedBoxIds.size) return { ready: false, reason: "Nothing packed yet." };
  return { ready: true, reason: null };
}

export async function markFulfillmentShipped(
  invoiceId: string,
  by: string,
): Promise<FulfillmentRecord> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(invoiceId);
  // Transactional: the readiness check and the flip happen against the same
  // snapshot, so a concurrent box-remove can't slip a not-ready shipment through.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Shipment not found.");
    const record = serialize(snap.data() || {});
    if (record.status === "shipped") throw new Error("This shipment is already marked shipped.");
    const { ready, reason } = fulfillmentReadyToShip(record);
    if (!ready) throw new Error(reason || "Shipment isn't ready.");
    const now = new Date();
    tx.update(ref, { status: "shipped", shippedAt: now, shippedBy: by, updatedAt: now });
  });
  const saved = await ref.get();
  return serialize(saved.data() || {});
}

/** Admin undo for a mistaken "Mark shipped" — reopens the pack station. */
export async function markFulfillmentUnshipped(
  invoiceId: string,
  by: string,
): Promise<FulfillmentRecord> {
  const ref = getDb().collection(COLLECTION).doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Shipment not found.");
  const record = serialize(snap.data() || {});
  if (record.status !== "shipped") throw new Error("Shipment isn't marked shipped.");
  await ref.update({
    status: "packing",
    shippedAt: null,
    shippedBy: "",
    unshippedBy: by,
    updatedAt: new Date(),
  });
  const saved = await ref.get();
  return serialize(saved.data() || {});
}

/** Batch-load pack records for a queue of invoices (ids without a record are simply absent). */
export async function listFulfillmentRecordsByInvoiceIds(
  ids: string[],
): Promise<Map<string, FulfillmentRecord>> {
  const out = new Map<string, FulfillmentRecord>();
  const unique = [...new Set(ids.map((i) => String(i || "").trim()).filter(Boolean))];
  if (!unique.length) return out;
  const db = getDb();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const snaps = await db.getAll(...chunk.map((id) => db.collection(COLLECTION).doc(id)));
    for (const s of snaps) if (s.exists) out.set(s.id, serialize(s.data() || {}));
  }
  return out;
}

/** Shipments marked shipped inside [start, end) — feeds the end-of-day manifest. */
export async function listFulfillmentShippedBetween(
  start: Date,
  end: Date,
): Promise<FulfillmentRecord[]> {
  const snap = await getDb()
    .collection(COLLECTION)
    .where("shippedAt", ">=", start)
    .where("shippedAt", "<", end)
    .get();
  return snap.docs
    .map((d) => serialize(d.data() || {}))
    .sort((a, b) => String(b.shippedAt || "").localeCompare(String(a.shippedAt || "")));
}

/** Buyer-facing: per-item tracking map for an invoice (null when not packed via fulfillment). */
export async function getFulfillmentForInvoice(invoiceId: string): Promise<FulfillmentRecord | null> {
  const snap = await getDb().collection(COLLECTION).doc(invoiceId).get();
  if (!snap.exists) return null;
  return serialize(snap.data() || {});
}
