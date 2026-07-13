import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { listHoldAlertsForBuyer } from "@/lib/firestore/holdAlerts";
import { EmptyState } from "@/components/EmptyState";
import { HoldAlertButton } from "@/components/HoldAlertButton";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  const alerts = session.username ? await listHoldAlertsForBuyer(session.username) : [];

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Wishlist</h1>
      <p className="mt-1 text-[13px] text-secondary">
        Pieces currently on hold for another buyer — we&apos;ll keep them here so you can jump
        back in if they free up.
      </p>

      {alerts.length === 0 ? (
        <EmptyState
          title="No wishlist alerts yet."
          hint="On a held piece's page, choose “Notify me when available.”"
          className="mt-8"
        />
      ) : (
        <div className="mt-8 overflow-hidden rounded-card border border-border bg-surface">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-4 border-b border-border/60 px-5 py-4 last:border-b-0"
            >
              <div className="flex-1">
                <Link
                  href={`/wholesale/product/${a.sku}`}
                  className="font-semibold text-ink hover:text-accent hover:underline"
                >
                  {a.title}
                </Link>
                <div className="font-mono text-[11px] text-muted">
                  {a.sku}
                  {a.brand ? ` · ${a.brand}` : ""}
                </div>
              </div>
              <HoldAlertButton sku={a.sku} active />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
