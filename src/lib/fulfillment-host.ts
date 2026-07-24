import { headers } from "next/headers";

/**
 * ppas.luxesupply.co is the fulfillment domain. Staff who land there should
 * drop straight into the pack & ship console instead of the rep portal —
 * that's the whole point of giving the shippers their own subdomain.
 */
export function isFulfillmentHostName(host: string | null | undefined): boolean {
  const clean = String(host || "").split(",")[0]!.trim().toLowerCase();
  return clean === "ppas.luxesupply.co" || clean.startsWith("ppas.");
}

/** Request-scoped check for server components / server actions. */
export async function isFulfillmentHost(): Promise<boolean> {
  const h = await headers();
  return isFulfillmentHostName(h.get("x-forwarded-host") || h.get("host"));
}
