import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Staff management lives under Settings → People. */
export default function StaffPage() {
  redirect("/wholesaleportal/rep/settings/people");
}
