"use client";

import {
  SETTINGS_GROUP_ORDER,
  SETTINGS_SECTIONS,
  canSeeSettingsSection,
  type SettingsSectionKey,
} from "@/lib/settings-sections";

export function SettingsSidebar({
  active,
  isManager,
}: {
  active: SettingsSectionKey;
  isManager: boolean;
}) {
  return (
    <nav className="space-y-5">
      {SETTINGS_GROUP_ORDER.map((group) => {
        const items = SETTINGS_SECTIONS.filter(
          (s) => s.group === group && canSeeSettingsSection(s, isManager),
        );
        if (!items.length) return null;
        return (
          <div key={group}>
            <div className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {group}
            </div>
            <ul className="space-y-0.5">
              {items.map((s) => {
                const on = s.key === active;
                return (
                  <li key={s.key}>
                    <a
                      href={s.href}
                      className={
                        "block rounded-chip px-2.5 py-2 text-[13px] transition " +
                        (on
                          ? "bg-ink text-ground"
                          : "text-secondary hover:bg-ground hover:text-ink")
                      }
                    >
                      {s.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
