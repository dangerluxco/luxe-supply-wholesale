import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { rejectRegistrationRequest } from "@/lib/firestore/registrationRequests";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const { id: applicationId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { reviewNote?: string };

  try {
    await rejectRegistrationRequest({
      id: applicationId,
      reviewedBy: session.email,
      reviewNote: body.reviewNote,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reject application." },
      { status: 400 },
    );
  }
}
