import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getSession();
  if (!session || session.role !== ROLE.BUYER) redirect("/wholesale/sign-in");

  return (
    <div className="px-8 pb-16 pt-8">
      <h1 className="text-[24px] font-semibold text-ink">Orders & quotes</h1>
      <p className="mt-1 text-[13px] text-secondary">
        Quote requests you submit appear in the staff quote queue. Full order history is coming with Net-30 invoices.
      </p>
      <EmptyState
        title="Quotes are tracked by the sales team."
        hint="After you request a quote from your cart, a rep will follow up — usually within one business day."
        className="mt-8"
      />
    </div>
  );
}
