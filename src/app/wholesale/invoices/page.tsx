import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Invoices UI deferred — Net-30 shipping with Prisma later. */
export default function InvoicesRedirect() {
  redirect("/wholesale/orders");
}
