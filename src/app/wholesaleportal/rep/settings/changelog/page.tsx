import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { ChangelogTable } from "@/components/settings/ChangelogTable";
import { requireSettingsSession } from "@/lib/settings-access";
import { listAuditEvents } from "@/lib/firestore/audit";

export const dynamic = "force-dynamic";

export default async function SettingsChangelogPage() {
  const { isManager } = await requireSettingsSession({ managerOnly: true });
  let events: Awaited<ReturnType<typeof listAuditEvents>> = [];
  try {
    events = await listAuditEvents(300);
  } catch {
    events = [];
  }

  return (
    <SettingsSectionShell
      title="Change log"
      subtitle="Recent settings, access, and staff mutations."
      active="changelog"
      isManager={isManager}
    >
      <ChangelogTable events={events} />
    </SettingsSectionShell>
  );
}
