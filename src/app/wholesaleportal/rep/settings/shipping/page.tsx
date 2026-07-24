import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { ShippingSettingsForm } from "@/components/settings/SettingsForms";
import { BoxPresetsForm } from "@/components/settings/BoxPresetsForm";
import { requireSettingsSession } from "@/lib/settings-access";
import { getShippingRules, getBoxPresets } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export default async function SettingsShippingPage() {
  const { isManager } = await requireSettingsSession({ managerOnly: true });
  const [rules, boxPresets] = await Promise.all([getShippingRules(), getBoxPresets()]);
  return (
    <SettingsSectionShell
      title="Shipping"
      subtitle="Which methods buyers see at checkout, their prices, and the free-shipping threshold."
      active="shipping"
      isManager={isManager}
    >
      <ShippingSettingsForm initial={rules} />
      <BoxPresetsForm initial={boxPresets} />
    </SettingsSectionShell>
  );
}
