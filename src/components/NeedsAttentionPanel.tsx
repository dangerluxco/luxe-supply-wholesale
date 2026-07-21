import { MicroBadge } from "@/components/badges";
import type { NeedsAttentionItem } from "@/lib/repDashboard";

const KIND_LABEL: Record<NeedsAttentionItem["kind"], string> = {
  request: "REQUEST",
  invoice: "INVOICE",
  application: "APPLICATION",
  client: "CLIENT",
};

const KIND_TONE: Record<NeedsAttentionItem["kind"], "solid-red" | "outline-gold" | "outline-gray" | "outline-dark"> = {
  request: "outline-gold",
  invoice: "solid-red",
  application: "outline-gray",
  client: "outline-dark",
};

export function NeedsAttentionPanel({ items }: { items: NeedsAttentionItem[] }) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[14px] font-semibold text-ink">Needs attention</div>
        <span className="font-mono text-[11px] text-muted">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-muted">All caught up — nothing urgent right now.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className="block rounded-chip border border-border/70 px-3 py-2.5 transition hover:border-accent hover:bg-ground/50"
            >
              <div className="mb-1 flex items-center gap-2">
                <MicroBadge tone={KIND_TONE[item.kind]} className="text-[9px]">
                  {KIND_LABEL[item.kind]}
                </MicroBadge>
              </div>
              <div className="text-[12.5px] font-medium text-ink">{item.label}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted">{item.detail}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
