import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { updateStaff } from "@/lib/firestore/staff";
import { logAudit } from "@/lib/firestore/audit";

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

  const body = (await request.json().catch(() => ({}))) as {
    isAdmin?: boolean;
    role?: string;
  };
  const role = ["admin", "staff", "fulfillment"].includes(String(body.role || ""))
    ? (body.role as "admin" | "staff" | "fulfillment")
    : undefined;

  try {
    const staff = await updateStaff(staffId.trim(), {
      isAdmin: role === undefined ? !!body.isAdmin : undefined,
      role,
      updatedBy: session.email,
    });
    await logAudit({
      actor: session,
      action: "staff.admin",
      entity: "staff",
      entityId: staff.id,
      payload: { isAdmin: staff.isAdmin, role: staff.role },
    });
    const label =
      staff.role === "admin"
        ? "Marked as admin."
        : staff.role === "fulfillment"
          ? "Set to Fulfillment (PPAS)."
          : "Set to rep.";
    return NextResponse.json({
      ok: true,
      message: label,
      isAdmin: staff.isAdmin,
      role: staff.role,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update admin." },
      { status: 400 },
    );
  }
}
