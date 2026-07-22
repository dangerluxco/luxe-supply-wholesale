import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listStaff } from "@/lib/firestore/staff";

export const dynamic = "force-dynamic";

/** Active staff list for the "Assign to" dropdown on order requests. */
export async function GET() {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const staff = await listStaff();
  const active = staff
    // PPAS (warehouse) logins don't work order requests — keep them out of "Assign to".
    .filter((s) => s.status !== "disabled" && s.role !== "fulfillment")
    .map((s) => ({ email: s.email, displayName: s.displayName || s.email }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ staff: active });
}
