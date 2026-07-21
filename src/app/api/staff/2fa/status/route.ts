import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { ROLE } from "@/lib/constants";
import { staffTotpRedirectPath } from "@/lib/staff-totp-gate";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireStaffSession({ allowPendingTotp: true });
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    role: session.role,
    isManager: session.role === ROLE.MANAGER,
    totpEnabled: !!session.totpEnabled,
    totpVerified: !!session.totpVerified,
    redirect: staffTotpRedirectPath(session),
  });
}
