import { listBuyers } from "@/lib/firestore/buyers";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const buyers = await listBuyers();

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">Clients</h1>
        <span className="text-[12px] text-muted">
          Firestore `salesPortalBuyers` · storefront logins
        </span>
      </div>

      {buyers.length === 0 ? (
        <EmptyState
          title="No clients yet."
          hint="Invite buyers from the legacy portal tools or Cloud Functions; they will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[1.2fr_1fr_1.2fr_1fr_100px] border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Name</span>
            <span>Username</span>
            <span>Email</span>
            <span>Company</span>
            <span className="text-center">Status</span>
          </div>
          {buyers.map((b) => (
            <div
              key={b.id}
              className="grid grid-cols-[1.2fr_1fr_1.2fr_1fr_100px] items-center border-b border-border/60 px-5 py-3.5 text-[12.5px] text-[#3A3934] last:border-b-0 hover:bg-ground"
            >
              <span className="font-semibold text-ink">{b.displayName || "—"}</span>
              <span className="font-mono text-[11px]">@{b.username}</span>
              <span className="truncate">{b.email || "—"}</span>
              <span>{b.company || "—"}</span>
              <span className="text-center font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                {b.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
