import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/auth";
import { isFulfillmentHost } from "@/lib/fulfillment-host";
import { ROLE } from "@/lib/constants";

export default async function WholesalePortalIndex() {
  const session = await getSession();
  if (!session) redirect("/wholesaleportal/sign-in");
  // On the fulfillment domain (ppas.), managers land in the pack console —
  // that's what the subdomain is for. Reps have no fulfillment access.
  if (session.role === ROLE.MANAGER && (await isFulfillmentHost())) {
    redirect("/fulfillment");
  }
  if (session.role === ROLE.REP || session.role === ROLE.MANAGER) {
    redirect(homeForRole(session.role));
  }
  if (session.role === ROLE.FULFILLMENT) redirect("/fulfillment");
  redirect("/wholesaleportal/sign-in");
}
