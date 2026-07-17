import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { createCurationShare } from "@/lib/firestore/curation";
import { buyerStorefrontOrigin } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Body = {
  items?: Array<{
    sku: string;
    title?: string;
    brand?: string;
    condition?: string;
    cost?: number | null;
    price: number;
    imageUrl?: string | null;
    imageUrls?: string[];
  }>;
  clientName?: string;
  invoiceDate?: string;
  note?: string;
  expiresHours?: number;
};

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Add at least one priced item." }, { status: 400 });
  }

  try {
    const share = await createCurationShare({
      items: body.items,
      clientName: body.clientName,
      invoiceDate: body.invoiceDate,
      note: body.note,
      expiresHours: body.expiresHours,
      createdByEmail: session.email,
      createdByDisplayName: session.name,
    });
    const origin = buyerStorefrontOrigin();
    return NextResponse.json({
      ok: true,
      share,
      url: `${origin}/curation/${share.token}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create curation link." },
      { status: 400 },
    );
  }
}
