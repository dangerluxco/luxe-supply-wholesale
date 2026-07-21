import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { ROLE } from "@/lib/constants";
import { createInviteCode, listInviteCodes } from "@/lib/firestore/inviteCodes";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireStaffSession();
  if (!session || session.role !== ROLE.MANAGER) {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }
  const codes = await listInviteCodes();
  return NextResponse.json({ codes });
}

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session || session.role !== ROLE.MANAGER) {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    label?: string;
    maxUses?: number;
    code?: string;
    expiresAt?: string | null;
  };
  try {
    const code = await createInviteCode({
      label: body.label,
      maxUses: body.maxUses,
      code: body.code,
      expiresAt: body.expiresAt,
      createdBy: session.email,
    });
    await logAudit({
      actor: session,
      action: "invite_code.create",
      entity: "InviteCode",
      entityId: code.id,
      payload: { code: code.code, maxUses: code.maxUses },
    });
    return NextResponse.json({ ok: true, code });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create code." },
      { status: 400 },
    );
  }
}
