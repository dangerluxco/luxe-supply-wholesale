import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-api-auth";
import { ROLE } from "@/lib/constants";
import {
  saveCompanyProfile,
  saveInvoicingProfile,
  saveNotifyEmails,
  savePortalFeatures,
  saveQuoteSettings,
  saveSalesGoals,
  saveShippingRules,
  saveBoxPresets,
} from "@/lib/firestore/settings";
import { logAudit } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ error: "Staff session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const section = String(body.section || "thresholds");
  const isManager = session.role === ROLE.MANAGER;

  try {
    if (section === "notifications") {
      const notifyEmails = String(body.notifyEmails || "")
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      await saveNotifyEmails(notifyEmails);
      await logAudit({
        actor: session,
        action: "settings.notifications.update",
        entity: "Settings",
        entityId: "notifications",
        payload: { count: notifyEmails.length },
      });
      return NextResponse.json({ ok: true, message: "Notifications saved." });
    }

    if (!isManager) {
      return NextResponse.json({ error: "Manager access required." }, { status: 403 });
    }

    if (section === "general") {
      const saved = await saveCompanyProfile((body.companyProfile || {}) as Record<string, string>);
      await logAudit({
        actor: session,
        action: "settings.general.update",
        entity: "Settings",
        entityId: "general",
        payload: { displayName: saved.displayName },
      });
      return NextResponse.json({ ok: true, message: "General settings saved." });
    }

    if (section === "invoicing") {
      const saved = await saveInvoicingProfile((body.invoicing || {}) as Record<string, string>);
      await logAudit({
        actor: session,
        action: "settings.invoicing.update",
        entity: "Settings",
        entityId: "invoicing",
        payload: { legalName: saved.legalName },
      });
      return NextResponse.json({ ok: true, message: "Invoicing settings saved." });
    }

    if (section === "goals") {
      const saved = await saveSalesGoals(
        (body.goals || {}) as Parameters<typeof saveSalesGoals>[0],
      );
      await logAudit({
        actor: session,
        action: "settings.goals.update",
        entity: "Settings",
        entityId: "goals",
        payload: saved,
      });
      return NextResponse.json({ ok: true, message: "Sales goals saved." });
    }

    if (section === "shipping") {
      const saved = await saveShippingRules(body.shippingRules || {});
      await logAudit({
        actor: session,
        action: "settings.shipping.update",
        entity: "Settings",
        entityId: "shipping",
        payload: {
          freeShippingThreshold: saved.freeShippingThreshold,
          methods: saved.methods.map((m) => ({
            id: m.id,
            price: m.price,
            enabled: m.enabled,
            compEligible: m.compEligible,
          })),
        },
      });
      return NextResponse.json({ ok: true, message: "Shipping rules saved." });
    }

    if (section === "boxes") {
      const saved = await saveBoxPresets(body.boxPresets);
      await logAudit({
        actor: session,
        action: "settings.boxes.update",
        entity: "Settings",
        entityId: "boxes",
        payload: { count: saved.length },
      });
      return NextResponse.json({ ok: true, message: "Standard box sizes saved." });
    }

    if (section === "features") {
      const saved = await savePortalFeatures((body.features || {}) as Record<string, boolean>);
      await logAudit({
        actor: session,
        action: "settings.features.update",
        entity: "Settings",
        entityId: "features",
        payload: saved,
      });
      return NextResponse.json({ ok: true, message: "Features saved." });
    }

    // thresholds (default / legacy)
    const minItemCount = Number(body.minItemCount || 0);
    const minCartTotal = Number(body.minCartTotal || 0);
    await saveQuoteSettings({
      minItemCount: Number.isFinite(minItemCount) ? minItemCount : 0,
      minCartTotal: Number.isFinite(minCartTotal) ? minCartTotal : 0,
    });
    await logAudit({
      actor: session,
      action: "settings.thresholds.update",
      entity: "Settings",
      entityId: "thresholds",
      payload: { minItemCount, minCartTotal },
    });
    return NextResponse.json({ ok: true, message: "Thresholds saved." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save settings." },
      { status: 400 },
    );
  }
}
