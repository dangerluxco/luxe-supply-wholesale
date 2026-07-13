import { clsx } from "@/lib/clsx";

type Tone =
  | "solid-gold"
  | "outline-gold"
  | "solid-green"
  | "solid-red"
  | "outline-gray"
  | "solid-dark"
  | "outline-dark";

const TONES: Record<Tone, string> = {
  "solid-gold": "bg-accent text-ink border border-accent",
  "outline-gold": "border border-accent text-accent bg-transparent",
  "solid-green": "bg-success text-white border border-success",
  "solid-red": "bg-danger text-white border border-danger",
  "outline-gray": "border border-border text-secondary bg-transparent",
  "solid-dark": "bg-ink text-ground border border-ink",
  "outline-dark": "border border-white/25 text-white/80 bg-transparent",
};

export function MicroBadge({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "micro-badge inline-flex items-center rounded-[5px] px-2 py-[3px] leading-none",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---- Invoice status: DRAFT outline gray / SENT outline gold / PAID solid green / OVERDUE solid red
export function InvoiceBadge({ status }: { status: string }) {
  const map: Record<string, Tone> = {
    DRAFT: "outline-gray",
    SENT: "outline-gold",
    PAID: "solid-green",
    OVERDUE: "solid-red",
  };
  return <MicroBadge tone={map[status] ?? "outline-gray"}>{status}</MicroBadge>;
}

// ---- Order / fulfillment status
export function OrderBadge({ status, dark = false }: { status: string; dark?: boolean }) {
  const label = status.replace("_", " ");
  const map: Record<string, Tone> = {
    CART: dark ? "outline-dark" : "outline-gray",
    TO_PICK: dark ? "outline-dark" : "outline-gray",
    PICKING: "solid-gold",
    PACKING: "solid-green",
    SHIPPED: dark ? "outline-dark" : "outline-gray",
  };
  return <MicroBadge tone={map[status] ?? "outline-gray"}>{label}</MicroBadge>;
}

// ---- Lead tiers: TIER 1 solid gold / TIER 2 outline gold / TIER 3 outline gray
export function TierBadge({ tier, label }: { tier: number; label?: string }) {
  const tone: Tone = tier === 1 ? "solid-gold" : tier === 2 ? "outline-gold" : "outline-gray";
  return <MicroBadge tone={tone}>{label ?? `TIER ${tier}`}</MicroBadge>;
}

export function LeadStatusBadge({ status }: { status: string }) {
  const map: Record<string, Tone> = {
    NEW: "outline-gold",
    CONTACTED: "solid-green",
    QUALIFYING: "outline-gold",
    WON: "solid-green",
    LOST: "outline-gray",
  };
  return <MicroBadge tone={map[status] ?? "outline-gray"}>{status}</MicroBadge>;
}
