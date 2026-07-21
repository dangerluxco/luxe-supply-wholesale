import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { GeneralSettingsForm } from "@/components/settings/SettingsForms";
import { requireSettingsSession } from "@/lib/settings-access";
import { getCompanyProfile } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export default async function SettingsGeneralPage() {
  const { isManager } = await requireSettingsSession({ managerOnly: true });
  const profile = await getCompanyProfile();
  return (
    <SettingsSectionShell
      title="General"
      subtitle="Company name, timezone, and branding shown across the portal."
      active="general"
      isManager={isManager}
    >
      <GeneralSettingsForm initial={profile} />
    </SettingsSectionShell>
  );
}
