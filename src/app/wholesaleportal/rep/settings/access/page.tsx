import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { AccessCodesPanel } from "@/components/settings/AccessCodesPanel";
import { requireSettingsSession } from "@/lib/settings-access";
import { listInviteCodes } from "@/lib/firestore/inviteCodes";

export const dynamic = "force-dynamic";

export default async function SettingsAccessPage() {
  const { isManager } = await requireSettingsSession({ managerOnly: true });
  const codes = await listInviteCodes();
  return (
    <SettingsSectionShell
      title="Access codes"
      subtitle="Required invite codes for the public wholesale registration form."
      active="access"
      isManager={isManager}
    >
      <AccessCodesPanel initial={codes} />
    </SettingsSectionShell>
  );
}
