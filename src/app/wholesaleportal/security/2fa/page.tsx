import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE } from "@/lib/constants";
import { TwoFactorManager } from "@/components/TwoFactorManager";
import { homeForRole } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export default async function StaffTwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const session = await getSession();
  if (!session || session.source !== "firestore" || session.role !== ROLE.MANAGER) {
    redirect("/wholesaleportal/sign-in");
  }

  const sp = await searchParams;
  const modeRaw = String(sp.mode || "").toLowerCase();
  let mode: "enroll" | "verify" = session.totpEnabled ? "verify" : "enroll";
  if (modeRaw === "enroll" || modeRaw === "verify") mode = modeRaw;

  if (session.totpEnabled && session.totpVerified && mode === "verify") {
    redirect(homeForRole(ROLE.MANAGER));
  }
  if (!session.totpEnabled && mode === "verify") {
    redirect("/wholesaleportal/security/2fa?mode=enroll");
  }
  if (session.totpEnabled && mode === "enroll" && session.totpVerified) {
    redirect(homeForRole(ROLE.MANAGER));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4 py-12">
      <TwoFactorManager mode={mode} email={session.email} />
    </div>
  );
}
