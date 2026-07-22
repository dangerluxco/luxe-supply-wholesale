import { logAudit } from "@/lib/firestore/audit";
import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { createCurationShare } from "@/lib/firestore/curation";
import { getBuyerById } from "@/lib/firestore/buyers";
import { buyerStorefrontOrigin } from "@/lib/notify";
import { featureDisabledResponse } from "@/lib/feature-gates";

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
  linkedBuyerId?: string | null;
  invoiceDate?: string;
  note?: string;
  expiresHours?: number;
};

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const disabled = await featureDisabledResponse("curation");
  if (disabled) return disabled;

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Add at least one priced item." }, { status: 400 });
  }

  const linkedBuyerId = String(body.linkedBuyerId || "").trim();
  let clientName = String(body.clientName || "").trim();

  if (linkedBuyerId) {
    const buyer = await getBuyerById(linkedBuyerId);
    if (!buyer || buyer.status === "disabled") {
      return NextResponse.json({ error: "Selected client was not found." }, { status: 400 });
    }
    clientName = buyer.displayName || buyer.username || buyer.email || clientName;
  } else if (!clientName) {
    return NextResponse.json(
      { error: "Choose an existing client or enter a potential client name." },
      { status: 400 },
    );
  }

  try {
    const share = await createCurationShare({
      items: body.items,
      clientName,
      linkedBuyerId: linkedBuyerId || null,
      invoiceDate: body.invoiceDate,
      note: body.note,
      expiresHours: body.expiresHours,
      createdByEmail: session.email,
      createdByDisplayName: session.name,
    });
    await logAudit({
      actor: session,
      action: "curation.created",
      entity: "curation",
      entityId: share.token,
      payload: { clientName, itemCount: body.items?.length || 0 },
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
