import { Suspense } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { BrandedLoader } from "@/components/BrandedLoader";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function AuthLoading() {
  return <BrandedLoader fullScreen />;
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
