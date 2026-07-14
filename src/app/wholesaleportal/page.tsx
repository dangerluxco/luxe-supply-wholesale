import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/auth";
import { ROLE } from "@/lib/constants";

export default async function WholesalePortalIndex() {
  const session = await getSession();
  if (!session) redirect("/wholesaleportal/sign-in");
  if (session.role === ROLE.REP || session.role === ROLE.MANAGER) {
    redirect(homeForRole(session.role));
  }
  if (session.role === ROLE.FULFILLMENT) redirect("/fulfillment");
  redirect("/wholesaleportal/sign-in");
}
