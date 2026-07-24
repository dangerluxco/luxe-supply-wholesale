import { SettingsSectionShell } from "@/components/settings/SettingsSectionShell";
import { GoalsSettingsForm } from "@/components/settings/GoalsSettingsForm";
import { requireSettingsSession } from "@/lib/settings-access";
import { getSalesGoals } from "@/lib/firestore/settings";
import { listStaff } from "@/lib/firestore/staff";

export const dynamic = "force-dynamic";

export default async function SettingsGoalsPage() {
  const { isManager } = await requireSettingsSession({ managerOnly: true });
  const [goals, staff] = await Promise.all([getSalesGoals(), listStaff().catch(() => [])]);
  return (
    <SettingsSectionShell
      title="Sales goals"
      subtitle="Monthly / weekly revenue and gross-profit targets — progress shows on Performance."
      active="goals"
      isManager={isManager}
    >
      <GoalsSettingsForm
        initial={goals}
        staff={staff.map((s) => ({ email: s.email, name: s.displayName || s.email }))}
      />
    </SettingsSectionShell>
  );
}
