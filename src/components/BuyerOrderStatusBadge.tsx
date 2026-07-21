import { MicroBadge } from "@/components/badges";
import { BUYER_QUOTE_STATUS_LABEL } from "@/lib/constants";

const TONE: Record<string, "solid-gold" | "outline-gold" | "solid-green" | "solid-red" | "outline-gray"> = {
  open: "outline-gold", // Pending approval — waiting on the sales team
  contacted: "solid-gold",
  quoted: "solid-green", // Invoice sent
  closed: "outline-gray",
  declined: "solid-red",
  timed_out: "outline-gray",
};

/** Buyer-facing status pill for order requests (frontend portal vocabulary). */
export function BuyerOrderStatusBadge({ status }: { status: string }) {
  return (
    <MicroBadge tone={TONE[status] ?? "outline-gray"}>
      {(BUYER_QUOTE_STATUS_LABEL[status] || status).toUpperCase()}
    </MicroBadge>
  );
}
