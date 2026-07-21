import { listActiveCurationShares } from "@/lib/firestore/curation";
import { CurationBuilder } from "@/components/CurationBuilder";

export const dynamic = "force-dynamic";

export default async function CurationPage() {
  let shares: Awaited<ReturnType<typeof listActiveCurationShares>> = [];
  try {
    shares = await listActiveCurationShares();
  } catch (err) {
    console.warn("[rep curation] Firestore unavailable:", err instanceof Error ? err.message : err);
  }

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Curate Order</h1>
        <span className="text-[12px] text-muted">
          Build a shareable, time-limited link for a client to approve/decline items during a
          sales call.
        </span>
      </div>

      <CurationBuilder initialShares={shares} />
    </div>
  );
}
