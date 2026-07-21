import type { ReactNode } from "react";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import type { SettingsSectionKey } from "@/lib/settings-sections";

export function SettingsSectionShell({
  title,
  subtitle,
  active,
  isManager,
  children,
}: {
  title: string;
  subtitle?: string;
  active: SettingsSectionKey;
  isManager: boolean;
  children: ReactNode;
}) {
  return (
    <div className="px-10 pb-12 pt-8">
      <div className="mb-6">
        <h1 className="text-[24px] font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">Company configuration, access, and audit trail.</p>
      </div>
      <div className="flex gap-8">
        <aside className="w-52 shrink-0">
          <SettingsSidebar active={active} isManager={isManager} />
        </aside>
        <div className="min-w-0 flex-1">
          <div className="mb-4">
            <h2 className="text-[18px] font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-1 text-[13px] text-muted">{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
