import { BuyerRegistrationForm } from "@/components/BuyerRegistrationForm";

export const dynamic = "force-dynamic";

export default function BuyerRegisterPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 pb-20">
      <BuyerRegistrationForm />
    </div>
  );
}
