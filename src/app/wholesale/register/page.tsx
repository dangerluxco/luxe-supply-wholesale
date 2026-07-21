import { BuyerRegistrationForm } from "@/components/BuyerRegistrationForm";

export const dynamic = "force-dynamic";

export default async function BuyerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  const initialCode = String(sp.code || "").trim();
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 pb-20">
      <BuyerRegistrationForm initialCode={initialCode} />
    </div>
  );
}
