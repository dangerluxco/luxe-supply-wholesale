import { redirect } from "next/navigation";

/** Old CDN-poisoned staff login path */
export const dynamic = "force-dynamic";

export default function LoginRedirect() {
  redirect("/wholesaleportal/sign-in");
}
