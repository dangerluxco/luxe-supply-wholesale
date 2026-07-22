// Buyer-initiated call/viewing requests about a specific piece — the storefront
// counterpart to the staff-initiated call-request flow. Stored in
// `salesPortalCallRequests`; surfaced on the rep dashboard until handled.
import { getDb, toIso } from "./admin";
import { getLuxesupplyOrg } from "./staff";

export type CallRequestItem = {
  id: string;
  sku: string;
  title: string;
  /** Product hero image at request time (render-time catalog fallback for old docs). */
  imageUrl: string | null;
  /** Multi-piece requests (e.g. from the cart). Single-piece requests leave this empty
   *  and use sku/title/imageUrl directly. */
  items: Array<{ sku: string; title: string; imageUrl: string | null }>;
  portalUsername: string;
  buyerDisplayName: string;
  buyerEmail: string;
  preferredTimes: string;
  note: string;
  status: "pending" | "handled" | "converted";
  assignedToEmail: string;
  assignedToName: string;
  convertedQuoteId: string;
  createdAt: string | null;
  handledAt: string | null;
  handledBy: string;
};

function serialize(id: string, d: Record<string, unknown>): CallRequestItem {
  const rawStatus = String(d.status || "pending");
  return {
    id,
    sku: String(d.sku || ""),
    title: String(d.title || d.sku || ""),
    imageUrl: d.imageUrl ? String(d.imageUrl) : null,
    items: (Array.isArray(d.items) ? (d.items as Array<Record<string, unknown>>) : []).map((it) => ({
      sku: String(it.sku || ""),
      title: String(it.title || it.sku || ""),
      imageUrl: it.imageUrl ? String(it.imageUrl) : null,
    })),
    portalUsername: String(d.portalUsername || ""),
    buyerDisplayName: String(d.buyerDisplayName || d.portalUsername || ""),
    buyerEmail: String(d.buyerEmail || ""),
    preferredTimes: String(d.preferredTimes || ""),
    note: String(d.note || ""),
    status: rawStatus === "handled" ? "handled" : rawStatus === "converted" ? "converted" : "pending",
    assignedToEmail: String(d.assignedToEmail || ""),
    assignedToName: String(d.assignedToName || ""),
    convertedQuoteId: String(d.convertedQuoteId || ""),
    createdAt: toIso(d.createdAt),
    handledAt: toIso(d.handledAt),
    handledBy: String(d.handledBy || ""),
  };
}

/** Assign (or unassign with empty email) a pending call request to a staffer. */
export async function assignCallRequest(
  id: string,
  assignee: { email: string; name: string },
): Promise<void> {
  await getDb().collection("salesPortalCallRequests").doc(id).update({
    assignedToEmail: assignee.email,
    assignedToName: assignee.name,
    updatedAt: new Date(),
  });
}

/** Close a call request as converted into an order request. */
export async function markCallRequestConverted(
  id: string,
  quoteId: string,
  convertedBy: string,
): Promise<void> {
  await getDb().collection("salesPortalCallRequests").doc(id).update({
    status: "converted",
    convertedQuoteId: quoteId,
    handledAt: new Date(),
    handledBy: convertedBy,
    updatedAt: new Date(),
  });
}

export async function addCallRequest(opts: {
  username: string;
  displayName?: string;
  email?: string;
  sku: string;
  title?: string;
  imageUrl?: string | null;
  items?: Array<{ sku: string; title: string; imageUrl: string | null }>;
  preferredTimes?: string;
  note?: string;
}): Promise<string> {
  const org = await getLuxesupplyOrg();
  const now = new Date();
  const ref = await getDb().collection("salesPortalCallRequests").add({
    organizationId: org.id,
    portalUsername: String(opts.username || "").trim().toLowerCase(),
    buyerDisplayName: opts.displayName || opts.username,
    buyerEmail: opts.email || "",
    sku: String(opts.sku || "").trim(),
    title: opts.title || opts.sku,
    imageUrl: opts.imageUrl || null,
    items: (opts.items || []).slice(0, 100),
    preferredTimes: String(opts.preferredTimes || "").trim().slice(0, 500),
    note: String(opts.note || "").trim().slice(0, 2000),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function listPendingCallRequests(limitCount = 50): Promise<CallRequestItem[]> {
  const org = await getLuxesupplyOrg();
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection("salesPortalCallRequests")
      .where("organizationId", "==", org.id)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();
  } catch {
    snap = await db
      .collection("salesPortalCallRequests")
      .where("organizationId", "==", org.id)
      .limit(limitCount)
      .get();
  }
  return snap.docs
    .map((doc) => serialize(doc.id, doc.data() || {}))
    .filter((r) => r.status === "pending")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function getCallRequestById(id: string): Promise<CallRequestItem | null> {
  const snap = await getDb().collection("salesPortalCallRequests").doc(String(id || "").trim()).get();
  if (!snap.exists) return null;
  return serialize(snap.id, snap.data() || {});
}

export async function markCallRequestHandled(id: string, handledBy: string): Promise<void> {
  await getDb().collection("salesPortalCallRequests").doc(id).update({
    status: "handled",
    handledAt: new Date(),
    handledBy,
    updatedAt: new Date(),
  });
}
