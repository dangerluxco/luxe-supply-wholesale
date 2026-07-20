import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { resolveCuratedDraftItems } from "@/lib/firestore/catalog";

export const dynamic = "force-dynamic";

/**
 * Parse SKU batch text supporting:
 * - SKU only (one per line, comma, or space separated)
 * - SKU + Price (tab or comma separated columns)
 */
function parseBatchInput(text: string): Array<{ sku: string; price?: number }> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const parsed: Array<{ sku: string; price?: number }> = [];
  const seen = new Set<string>();

  for (const line of lines) {
    // Try tab-separated first (Excel copy format)
    if (line.includes('\t')) {
      const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 1) {
        const sku = parts[0]!;
        const key = sku.toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          const priceRaw = parts[1];
          const price = priceRaw ? parsePrice(priceRaw) : undefined;
          parsed.push({ sku, price });
        }
      }
      continue;
    }

    // Try comma-separated (CSV format)
    if (line.includes(',')) {
      const parts = line.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 1) {
        const sku = parts[0]!;
        const key = sku.toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          const priceRaw = parts[1];
          const price = priceRaw ? parsePrice(priceRaw) : undefined;
          parsed.push({ sku, price });
        }
      }
      continue;
    }

    // Single SKU per line
    const sku = line.trim();
    const key = sku.toUpperCase();
    if (sku && !seen.has(key)) {
      seen.add(key);
      parsed.push({ sku });
    }
  }

  // Also try space/semicolon separated for single-line paste
  if (parsed.length === 0) {
    const tokens = text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    for (const sku of tokens) {
      const key = sku.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        parsed.push({ sku });
      }
    }
  }

  return parsed;
}

function parsePrice(raw: string): number | undefined {
  const cleaned = String(raw).replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : undefined;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (
    !session ||
    session.source !== "firestore" ||
    (session.role !== ROLE.REP && session.role !== ROLE.MANAGER)
  ) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { skusText?: string };
  const batchInput = parseBatchInput(String(body.skusText || ""));
  
  if (!batchInput.length) {
    return NextResponse.json({ error: "Paste at least one SKU." }, { status: 400 });
  }
  if (batchInput.length > 1000) {
    return NextResponse.json({ error: "Paste 1000 SKUs or fewer at a time." }, { status: 400 });
  }

  try {
    const skus = batchInput.map(b => b.sku);
    const { items, unresolvedSkus } = await resolveCuratedDraftItems(skus);
    
    // Apply manual price overrides from paste
    const itemsWithPriceOverrides = items.map((item) => {
      const override = batchInput.find(
        b => b.sku.toUpperCase() === item.sku.toUpperCase() && b.price != null
      );
      if (override?.price != null) {
        return {
          ...item,
          price: override.price,
          priceOverridden: true,
        };
      }
      return item;
    });

    return NextResponse.json({ 
      ok: true, 
      items: itemsWithPriceOverrides, 
      unresolvedSkus,
      batchCount: batchInput.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not resolve SKUs." },
      { status: 400 },
    );
  }
}
