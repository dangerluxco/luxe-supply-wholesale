import { Suspense } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-[13px] text-muted">
      Loading…
    </div>
  );
}

export default function LoginPage() {
  return (
    <ClientOnly fallback={<AuthLoading />}>
      <Suspense fallback={<AuthLoading />}>
        <LoginForm />
      </Suspense>
    </ClientOnly>
  );
}
