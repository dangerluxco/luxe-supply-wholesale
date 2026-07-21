import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { ROLE } from "@/lib/constants";
import { revokeInviteCode } from "@/lib/firestore/inviteCodes";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session || session.role !== ROLE.MANAGER) {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    await revokeInviteCode(id);
    await logAudit({
      actor: session,
      action: "invite_code.revoke",
      entity: "InviteCode",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not revoke code." },
      { status: 400 },
    );
  }
}
