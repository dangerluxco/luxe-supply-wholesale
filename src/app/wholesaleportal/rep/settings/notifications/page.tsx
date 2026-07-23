import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { NotificationsSettingsForm } from "@/components/settings/SettingsForms";
import { EmailConfigWarning } from "@/components/EmailConfigWarning";
import { requireSettingsSession } from "@/lib/settings-access";
import { getNotifyEmails } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export default async function SettingsNotificationsPage() {
  const { isManager } = await requireSettingsSession();
  const emails = await getNotifyEmails();
  return (
    <SettingsSectionShell
      title="Notifications"
      subtitle="Extra recipients for order-request alerts."
      active="notifications"
      isManager={isManager}
    >
      <EmailConfigWarning />
      <NotificationsSettingsForm initialEmails={emails} />
    </SettingsSectionShell>
  );
}
