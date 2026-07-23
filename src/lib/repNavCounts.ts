import { getDb, toIso } from "@/lib/firestore/admin";
import { getLuxesupplyOrg } from "@/lib/firestore/staff";

/**
 * Lightweight attention counts for the staff sidebar badges. Loaded by the rep
 * layout on every staff page render, so results are cached in-process for a few
 * seconds — the AutoRefresh poll (20s) still picks up changes promptly without
 * hammering Firestore on quick navigations.
 */
export type RepNavCounts = {
  /** New (untouched) order requests — status "open". */
  openRequests: number;
  /** Buyer registration applications awaiting review. */
  pendingApplications: number;
  /** SENT invoices past their due date. */
  overdueInvoices: number;
};

const ZERO: RepNavCounts = { openRequests: 0, pendingApplications: 0, overdueInvoices: 0 };
const TTL_MS = 15_000;

let cache: { at: number; value: RepNavCounts } | null = null;

export async function getRepNavCounts(): Promise<RepNavCounts> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await computeCounts().catch(() => ZERO);
  cache = { at: Date.now(), value };
  return value;
}

async function countWhere(
  collection: string,
  orgId: string,
  field: string,
  op: FirebaseFirestore.WhereFilterOp,
  match: unknown,
): Promise<number> {
  const db = getDb();
  const query = db
    .collection(collection)
    .where("organizationId", "==", orgId)
    .where(field, op, match);
  try {
    const agg = await query.count().get();
    return agg.data().count;
  } catch {
    const snap = await query.limit(200).get();
    return snap.size;
  }
}

async function computeCounts(): Promise<RepNavCounts> {
  const org = await getLuxesupplyOrg();
  const db = getDb();

  const [openRequests, pendingApplications, sentSnap] = await Promise.all([
    countWhere("salesPortalQuotes", org.id, "status", "==", "open").catch(() => 0),
    countWhere("salesPortalBuyerApplications", org.id, "status", "==", "pending").catch(() => 0),
    // Overdue = SENT + past due; dueDate lives in mixed formats (Timestamp/ISO),
    // so pull the SENT set (small) and compare in memory via toIso.
    db
      .collection("salesPortalInvoices")
      .where("organizationId", "==", org.id)
      .where("status", "==", "SENT")
      .select("dueDate")
      .limit(300)
      .get()
      .catch(() => null),
  ]);

  let overdueInvoices = 0;
  if (sentSnap) {
    const now = Date.now();
    for (const doc of sentSnap.docs) {
      const due = toIso((doc.data() || {}).dueDate);
      if (due && new Date(due).getTime() < now) overdueInvoices += 1;
    }
  }

  return { openRequests, pendingApplications, overdueInvoices };
}
