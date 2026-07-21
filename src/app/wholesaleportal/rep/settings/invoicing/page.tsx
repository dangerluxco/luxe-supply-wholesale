import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { InvoicingSettingsForm } from "@/components/settings/SettingsForms";
import { requireSettingsSession } from "@/lib/settings-access";
import { getInvoicingProfile } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export default async function SettingsInvoicingPage() {
  const { isManager } = await requireSettingsSession({ managerOnly: true });
  const profile = await getInvoicingProfile();
  return (
    <SettingsSectionShell
      title="Invoicing"
      subtitle="Letterhead, wire details, and post-invoice notes/terms printed on branded PDFs."
      active="invoicing"
      isManager={isManager}
    >
      <InvoicingSettingsForm initial={profile} />
    </SettingsSectionShell>
  );
}
