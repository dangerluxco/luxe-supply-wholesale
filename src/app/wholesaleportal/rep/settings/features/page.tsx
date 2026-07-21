import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { FeaturesSettingsForm } from "@/components/settings/SettingsForms";
import { requireSettingsSession } from "@/lib/settings-access";
import { getPortalFeatures } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export default async function SettingsFeaturesPage() {
  const { isManager } = await requireSettingsSession({ managerOnly: true });
  const features = await getPortalFeatures();
  return (
    <SettingsSectionShell
      title="Features"
      subtitle="Toggle optional portal modules. Data is preserved when a feature is off."
      active="features"
      isManager={isManager}
    >
      <FeaturesSettingsForm initial={features} />
    </SettingsSectionShell>
  );
}
