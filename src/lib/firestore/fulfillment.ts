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

export type ScanResult = {
  record: FulfillmentRecord;
  outcome: "box_selected" | "box_created" | "item_assigned" | "error";
  message: string;
  currentBoxId: string | null;
};

/**
 * Process one scan. Rules:
 * - code matches an expected SKU  -> assign to the current box (error if none
 *   selected or already boxed — both logged)
 * - code matches an existing box barcode -> select that box
 * - anything else -> new box with that barcode (labels -1, -2, … per meeting)
 */
export async function recordScan(
  invoiceId: string,
  code: string,
  currentBoxId: string | null,
  by: string,
): Promise<ScanResult> {
  const cleaned = String(code || "").trim();
  if (!cleaned) throw new Error("Empty scan.");

  const ref = getDb().collection(COLLECTION).doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Open the shipment before scanning.");
  const data = snap.data() || {};
  const record = serialize(data);
  if (record.status === "shipped") throw new Error("This shipment is already marked shipped.");

  const now = new Date();
  const upper = cleaned.toUpperCase();
  const expected = new Set(record.expectedSkus.map((s) => s.toUpperCase()));
  const matchedSku = record.expectedSkus.find((s) => s.toUpperCase() === upper) || null;
  const matchedBox = record.boxes.find((b) => b.barcode.toUpperCase() === upper) || null;

  let outcome: ScanResult["outcome"];
  let message: string;
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
  } else if (expected.size && upper.length >= 3) {
    // Unknown code — treat as a new box barcode.
    const label = `-${boxes.length + 1}`;
    const box = {
      id: `box_${boxes.length + 1}_${Math.random().toString(36).slice(2, 8)}`,
      label,
      barcode: cleaned,
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
    boxes.push(box);
    nextCurrentBoxId = box.id;
    outcome = "box_created";
    message = `New box ${label} (${cleaned}) — scan items into it.`;
    scans.push({ at: now, by, code: cleaned, kind: "box", boxId: box.id, error: null });
  } else {
    outcome = "error";
    message = `“${cleaned}” isn't on this shipment.`;
    scans.push({ at: now, by, code: cleaned, kind: "error", boxId: null, error: message });
  }

  await ref.update({ scans, boxes, assignments, updatedAt: now });
  const saved = await ref.get();
  return { record: serialize(saved.data() || {}), outcome, message, currentBoxId: nextCurrentBoxId };
}

export async function setBoxTracking(
  invoiceId: string,
  boxId: string,
  tracking: { carrier: string; trackingNumber: string },
): Promise<FulfillmentRecord> {
  const ref = getDb().collection(COLLECTION).doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Shipment not found.");
  const record = serialize(snap.data() || {});
  const boxes = record.boxes.map((b) =>
    b.id === boxId
      ? {
          ...b,
          carrier: String(tracking.carrier || "").trim().slice(0, 40),
          trackingNumber: String(tracking.trackingNumber || "").trim().slice(0, 80),
          createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
        }
      : { ...b, createdAt: b.createdAt ? new Date(b.createdAt) : new Date() },
  );
  if (!boxes.some((b) => b.id === boxId)) throw new Error("Box not found.");
  await ref.update({
    boxes,
    trackingNumbers: boxes.map((b) => b.trackingNumber).filter(Boolean),
    updatedAt: new Date(),
  });
  const saved = await ref.get();
  return serialize(saved.data() || {});
}

async function updateBox(
  invoiceId: string,
  boxId: string,
  patch: Record<string, unknown>,
): Promise<FulfillmentRecord> {
  const ref = getDb().collection(COLLECTION).doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Shipment not found.");
  const record = serialize(snap.data() || {});
  if (!record.boxes.some((b) => b.id === boxId)) throw new Error("Box not found.");
  const boxes = record.boxes.map((b) =>
    b.id === boxId
      ? { ...b, ...patch, createdAt: b.createdAt ? new Date(b.createdAt) : new Date() }
      : { ...b, createdAt: b.createdAt ? new Date(b.createdAt) : new Date() },
  );
  await ref.update({
    boxes,
    // Query index for the tracking webhook (nested array fields aren't queryable).
    trackingNumbers: boxes.map((b) => b.trackingNumber).filter(Boolean),
    updatedAt: new Date(),
  });
  const saved = await ref.get();
  return serialize(saved.data() || {});
}

/** Webhook-fed: stamp the latest carrier status onto whichever box owns the tracking number. */
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
  const ref = getDb().collection(COLLECTION).doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Shipment not found.");
  const record = serialize(snap.data() || {});
  if (Object.values(record.assignments).includes(boxId)) {
    throw new Error("Box has items in it — move them first.");
  }
  const boxes = record.boxes
    .filter((b) => b.id !== boxId)
    .map((b) => ({ ...b, createdAt: b.createdAt ? new Date(b.createdAt) : new Date() }));
  await ref.update({ boxes, updatedAt: new Date() });
  const saved = await ref.get();
  return serialize(saved.data() || {});
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
  const ref = getDb().collection(COLLECTION).doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Shipment not found.");
  const record = serialize(snap.data() || {});
  const { ready, reason } = fulfillmentReadyToShip(record);
  if (!ready) throw new Error(reason || "Shipment isn't ready.");
  const now = new Date();
  await ref.update({ status: "shipped", shippedAt: now, shippedBy: by, updatedAt: now });
  const saved = await ref.get();
  return serialize(saved.data() || {});
}

/** Buyer-facing: per-item tracking map for an invoice (null when not packed via fulfillment). */
export async function getFulfillmentForInvoice(invoiceId: string): Promise<FulfillmentRecord | null> {
  const snap = await getDb().collection(COLLECTION).doc(invoiceId).get();
  if (!snap.exists) return null;
  return serialize(snap.data() || {});
}
