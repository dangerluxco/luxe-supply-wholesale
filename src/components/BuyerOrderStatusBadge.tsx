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

/** Buyer-facing status pill for order requests (frontend portal vocabulary).
 * The stored status stays "quoted" for the order's whole post-invoice life —
 * fulfillment progress lives in shippedAt/fulfilledAt stamps, so the pill
 * derives from those first ("Invoice sent" on a shipped order confused buyers). */
export function BuyerOrderStatusBadge({
  status,
  shippedAt,
  fulfilledAt,
}: {
  status: string;
  shippedAt?: string | null;
  fulfilledAt?: string | null;
}) {
  if (status === "quoted" && shippedAt) {
    return <MicroBadge tone="solid-green">SHIPPED</MicroBadge>;
  }
  if (status === "quoted" && fulfilledAt) {
    return <MicroBadge tone="outline-gold">PREPARING SHIPMENT</MicroBadge>;
  }
  return (
    <MicroBadge tone={TONE[status] ?? "outline-gray"}>
      {(BUYER_QUOTE_STATUS_LABEL[status] || status).toUpperCase()}
    </MicroBadge>
  );
}
