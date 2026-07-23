export type SettingsRole = "staff" | "manager";
export type SettingsGroup = "Company" | "Team" | "Your account";

export type SettingsSectionKey =
  | "general"
  | "invoicing"
  | "thresholds"
  | "shipping"
  | "features"
  | "goals"
  | "people"
  | "access"
  | "notifications"
  | "changelog";

export type SettingsSection = {
  key: SettingsSectionKey;
  href: string;
  label: string;
  group: SettingsGroup;
  minRole: SettingsRole;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: "general", href: "/wholesaleportal/rep/settings/general", label: "General", group: "Company", minRole: "manager" },
  { key: "invoicing", href: "/wholesaleportal/rep/settings/invoicing", label: "Invoicing", group: "Company", minRole: "manager" },
  { key: "thresholds", href: "/wholesaleportal/rep/settings/thresholds", label: "Order thresholds", group: "Company", minRole: "manager" },
  { key: "shipping", href: "/wholesaleportal/rep/settings/shipping", label: "Shipping", group: "Company", minRole: "manager" },
  { key: "features", href: "/wholesaleportal/rep/settings/features", label: "Features", group: "Company", minRole: "manager" },
  { key: "goals", href: "/wholesaleportal/rep/settings/goals", label: "Sales goals", group: "Company", minRole: "manager" },
  { key: "people", href: "/wholesaleportal/rep/settings/people", label: "People", group: "Team", minRole: "manager" },
  { key: "access", href: "/wholesaleportal/rep/settings/access", label: "Access codes", group: "Team", minRole: "manager" },
  { key: "notifications", href: "/wholesaleportal/rep/settings/notifications", label: "Notifications", group: "Your account", minRole: "staff" },
  { key: "changelog", href: "/wholesaleportal/rep/settings/changelog", label: "Change log", group: "Company", minRole: "manager" },
];

export const SETTINGS_GROUP_ORDER: SettingsGroup[] = ["Company", "Team", "Your account"];

export function canSeeSettingsSection(section: SettingsSection, isManager: boolean): boolean {
  return section.minRole === "staff" || isManager;
}

export function firstSettingsSection(isManager: boolean): SettingsSection {
  return (
    SETTINGS_SECTIONS.find((s) => canSeeSettingsSection(s, isManager)) ??
    SETTINGS_SECTIONS.find((s) => s.key === "notifications")!
  );
}
