import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { ShippingSettingsForm } from "@/components/settings/SettingsForms";
import { requireSettingsSession } from "@/lib/settings-access";
import { getShippingRules } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export default async function SettingsShippingPage() {
  const { isManager } = await requireSettingsSession({ managerOnly: true });
  const rules = await getShippingRules();
  return (
    <SettingsSectionShell
      title="Shipping"
      subtitle="Which methods buyers see at checkout, their prices, and the free-shipping threshold."
      active="shipping"
      isManager={isManager}
    >
      <ShippingSettingsForm initial={rules} />
    </SettingsSectionShell>
  );
}
