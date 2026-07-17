import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { saveQuoteSettings } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    minItemCount?: number;
    minCartTotal?: number;
    notifyEmails?: string;
  };

  const minItemCount = Number(body.minItemCount || 0);
  const minCartTotal = Number(body.minCartTotal || 0);
  const notifyEmails = String(body.notifyEmails || "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  try {
    await saveQuoteSettings({
      minItemCount: Number.isFinite(minItemCount) ? minItemCount : 0,
      minCartTotal: Number.isFinite(minCartTotal) ? minCartTotal : 0,
      notifyEmails,
    });
    return NextResponse.json({ ok: true, message: "Settings saved." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save settings." },
      { status: 400 },
    );
  }
}
