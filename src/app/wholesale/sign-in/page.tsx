import { Suspense } from "react";
import BuyerLoginForm from "./BuyerLoginForm";

export const dynamic = "force-dynamic";

export default function BuyerSignInPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-[13px] text-muted">Loading…</div>}>
      <BuyerLoginForm />
    </Suspense>
  );
}
