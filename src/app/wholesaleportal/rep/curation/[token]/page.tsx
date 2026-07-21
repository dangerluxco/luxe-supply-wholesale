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
        ‹ Back to Curate Order
      </Link>
      <div className="mt-3">
        <CurationManage initialShare={share} buyerUrl={buyerUrl} />
      </div>
    </div>
  );
}
