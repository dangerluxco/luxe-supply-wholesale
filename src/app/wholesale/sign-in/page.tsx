import { Suspense } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { BrandedLoader } from "@/components/BrandedLoader";
import BuyerLoginForm from "./BuyerLoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function AuthLoading() {
  return <BrandedLoader fullScreen />;
}

export default function BuyerSignInPage() {
  return (
    <ClientOnly fallback={<AuthLoading />}>
      <Suspense fallback={<AuthLoading />}>
        <BuyerLoginForm />
      </Suspense>
    </ClientOnly>
  );
}
