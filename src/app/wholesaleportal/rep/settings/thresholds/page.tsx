import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { ThresholdsSettingsForm } from "@/components/settings/SettingsForms";
import { requireSettingsSession } from "@/lib/settings-access";
import { getQuoteThresholds } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export default async function SettingsThresholdsPage() {
  const { isManager } = await requireSettingsSession({ managerOnly: true });
  const thresholds = await getQuoteThresholds();
  return (
    <SettingsSectionShell
      title="Order thresholds"
      subtitle="Minimum items / order value before a buyer can submit for review."
      active="thresholds"
      isManager={isManager}
    >
      <ThresholdsSettingsForm initial={thresholds} />
    </SettingsSectionShell>
  );
}
