// Timestamped activity thread for order requests (quotes) — same pattern as
// lead activities. Auto-entries come from status/claim/invoice mutations;
// manual entries are staff notes. Stored in `salesPortalQuoteActivities`.
import { getDb, toIso } from "./admin";

export type QuoteActivityType =
  | "note"
  | "status_change"
  | "claim"
  | "items_edited"
  | "invoice_generated"
  | "call_requested";

export type QuoteActivity = {
  id: string;
  quoteId: string;
  type: QuoteActivityType;
  text: string;
  staffEmail: string;
  staffName: string;
  createdAt: string | null;
};

function serialize(id: string, d: Record<string, unknown>): QuoteActivity {
  return {
    id,
    quoteId: String(d.quoteId || ""),
    type: (String(d.type || "note") as QuoteActivityType) || "note",
    text: String(d.text || ""),
    staffEmail: String(d.staffEmail || ""),
    staffName: String(d.staffName || ""),
    createdAt: toIso(d.createdAt),
  };
}

export async function addQuoteActivity(opts: {
  quoteId: string;
  type: QuoteActivityType;
  text: string;
  staffEmail: string;
  staffName?: string;
}): Promise<void> {
  const quoteId = String(opts.quoteId || "").trim();
  const text = String(opts.text || "").trim().slice(0, 2000);
  if (!quoteId || !text) return;
  await getDb().collection("salesPortalQuoteActivities").add({
    quoteId,
    type: opts.type,
    text,
    staffEmail: opts.staffEmail,
    staffName: opts.staffName || opts.staffEmail,
    createdAt: new Date(),
  });
}

export async function listQuoteActivities(quoteId: string, limitCount = 100): Promise<QuoteActivity[]> {
  const id = String(quoteId || "").trim();
  if (!id) return [];
  const db = getDb();
  let snap;
  try {
    snap = await db
      .collection("salesPortalQuoteActivities")
      .where("quoteId", "==", id)
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();
  } catch {
    snap = await db
      .collection("salesPortalQuoteActivities")
      .where("quoteId", "==", id)
      .limit(limitCount)
      .get();
  }
  return snap.docs
    .map((doc) => serialize(doc.id, doc.data() || {}))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
