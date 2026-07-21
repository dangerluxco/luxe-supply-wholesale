import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurationShareForStaff } from "@/lib/firestore/curation";
import { buyerStorefrontOrigin } from "@/lib/notify";
import { CurationManage } from "@/components/CurationManage";

export const dynamic = "force-dynamic";

export default async function CurationManagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await getCurationShareForStaff(token);
  if (!share) notFound();

  const buyerUrl = `${buyerStorefrontOrigin()}/curation/${token}`;

  return (
    <div className="px-10 pb-12 pt-8">
      <Link
        href="/wholesaleportal/rep/curation"
        className="text-[12px] text-muted transition hover:text-ink"
      >
        ‹ Back to Curation
      </Link>
      <div className="mb-6 mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[24px] font-semibold text-ink">
          {share.clientName || "Curation link"}
        </h1>
        <span className="font-mono text-[11px] text-muted">#{share.token.slice(0, 10)}…</span>
      </div>

      <CurationManage initialShare={share} buyerUrl={buyerUrl} />
    </div>
  );
}
