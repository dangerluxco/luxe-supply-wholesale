import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/auth-session";
import { findBuyerByIdentifier } from "@/lib/firestore/buyers";
import { createPasswordResetToken } from "@/lib/firestore/passwordResets";
import { buyerStorefrontOrigin, sendPasswordResetLinkEmail } from "@/lib/notify";
import { formField } from "@/lib/form";

export const dynamic = "force-dynamic";

// Always responds success (regardless of match) so this endpoint can't be used to
// enumerate registered buyer accounts.
export async function POST(request: Request) {
  const form = await request.formData();
  const identifier = formField(form, "identifier").trim();
  const origin = buyerStorefrontOrigin() || publicOrigin(request);

  try {
    const buyer = identifier ? await findBuyerByIdentifier(identifier) : null;
    if (buyer && buyer.status !== "disabled" && buyer.email) {
      const { token } = await createPasswordResetToken({
        role: "buyer",
        accountId: buyer.id,
        email: buyer.email,
      });
      const resetUrl = `${origin}/wholesale/reset-password?token=${token}`;
      const sent = await sendPasswordResetLinkEmail({
        email: buyer.email,
        resetUrl,
        isStaff: false,
      });
      console.log(
        `[buyer-forgot-password] buyer=${buyer.id} email=${buyer.email} sent=${sent}`,
      );
    } else {
      console.log(
        `[buyer-forgot-password] no send for identifier="${identifier}" ` +
          `(found=${!!buyer} status=${buyer?.status || "n/a"} email=${buyer?.email || "n/a"})`,
      );
    }
  } catch (err) {
    console.error(
      "[buyer-forgot-password] failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const res = NextResponse.redirect(
    new URL("/wholesale/forgot-password?sent=1", origin),
    303,
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
