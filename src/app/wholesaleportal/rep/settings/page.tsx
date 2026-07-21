import { redirect } from "next/navigation";
import { requireSettingsSession } from "@/lib/settings-access";
import { firstSettingsSection } from "@/lib/settings-sections";

export const dynamic = "force-dynamic";

export default async function SettingsIndexPage() {
  const { isManager } = await requireSettingsSession();
  redirect(firstSettingsSection(isManager).href);
}
