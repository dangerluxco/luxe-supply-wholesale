import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-[13px] text-muted">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
