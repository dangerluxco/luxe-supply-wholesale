import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { updateStaff } from "@/lib/firestore/staff";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== ROLE.MANAGER || session.source !== "firestore") {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const { id: staffId } = await ctx.params;
  if (!staffId?.trim()) {
    return NextResponse.json({ error: "Missing staff id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { isAdmin?: boolean };
  const isAdmin = !!body.isAdmin;

  try {
    const staff = await updateStaff(staffId.trim(), {
      isAdmin,
      updatedBy: session.email,
    });
    return NextResponse.json({
      ok: true,
      message: staff.isAdmin ? "Marked as admin." : "Admin removed.",
      isAdmin: staff.isAdmin,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update admin." },
      { status: 400 },
    );
  }
}
