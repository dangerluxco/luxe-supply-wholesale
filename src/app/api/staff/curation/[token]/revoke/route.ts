import { logAudit } from "@/lib/firestore/audit";
import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { revokeCurationShare } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  try {
    const result = await revokeCurationShare(token);
    await logAudit({ actor: session, action: "curation.revoked", entity: "curation", entityId: token });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not revoke link." },
      { status: 400 },
    );
  }
}
