import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { uploadProductImage } from "@/lib/firestore/productOverrides";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ sku: string }> }) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }
  const { sku } = await ctx.params;
  const cleanSku = decodeURIComponent(sku).trim();
  if (!cleanSku) {
    return NextResponse.json({ error: "Missing SKU." }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  // Cast avoids a DOM/undici FormData type clash in this Next build (see lib/form.ts).
  const getter = (form as unknown as { get?: (k: string) => unknown } | null)?.get;
  const file = typeof getter === "function" ? (getter.call(form, "file") as unknown) : null;
  if (!file || typeof file === "string" || typeof (file as Blob).arrayBuffer !== "function") {
    return NextResponse.json({ error: "No image file provided." }, { status: 400 });
  }
  const blob = file as Blob & { type?: string };

  try {
    const bytes = Buffer.from(await blob.arrayBuffer());
    const url = await uploadProductImage(cleanSku, bytes, blob.type || "image/jpeg");
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not upload image." },
      { status: 400 },
    );
  }
}
