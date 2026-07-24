import { getDb, toIso } from "./admin";
import { getLuxesupplyOrg } from "./staff";

const COLLECTION = "salesPortalBookedCalls";

/**
 * A booked call, written the moment staff hit "Book call" (on an order request
 * or an ad-hoc curation session). This is the dashboard's source of truth for
 * the "calls" column — curation-session counts were only ever a proxy (links
 * get created without calls, and ad-hoc bookings created no session at all).
 */
export type BookedCallStub = { staffEmail: string; createdAt: string | null };

export async function recordBookedCall(opts: {
  staffEmail: string;
  staffName?: string;
  buyerLabel?: string;
  quoteId?: string | null;
  curationToken?: string | null;
  scheduledStartIso?: string | null;
  durationMinutes?: number | null;
}): Promise<void> {
  const org = await getLuxesupplyOrg();
  await getDb()
    .collection(COLLECTION)
    .add({
      organizationId: org.id,
      staffEmail: String(opts.staffEmail || "").trim().toLowerCase(),
      staffName: String(opts.staffName || "").trim(),
      buyerLabel: String(opts.buyerLabel || "").trim(),
      quoteId: opts.quoteId || null,
      curationToken: opts.curationToken || null,
      scheduledStartIso: opts.scheduledStartIso || null,
      durationMinutes: opts.durationMinutes ?? null,
      createdAt: new Date(),
    });
}

/** Booked calls in a date range — powers the staff performance "calls" column. */
export async function listBookedCallsInRange(
  fromIso: string,
  toIsoParam: string,
): Promise<BookedCallStub[]> {
  const org = await getLuxesupplyOrg();
  const from = new Date(fromIso);
  const to = new Date(toIsoParam);

  let snap;
  try {
    snap = await getDb()
      .collection(COLLECTION)
      .where("organizationId", "==", org.id)
      .where("createdAt", ">=", from)
      .where("createdAt", "<=", to)
      .limit(2000)
      .get();
  } catch (err) {
    console.warn(
      "[bookedCalls] listBookedCallsInRange:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  return snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      staffEmail: String(d.staffEmail || "").trim(),
      createdAt: toIso(d.createdAt),
    };
  });
}
