import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { getCurationShareForStaff } from "@/lib/firestore/curation";

export const dynamic = "force-dynamic";

/** Staff detail/poll fetch — includes cost. Used by the manage page's live refresh. */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { token } = await ctx.params;
  const share = await getCurationShareForStaff(token);
  if (!share) {
    return NextResponse.json({ error: "Curation link not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, share });
}
