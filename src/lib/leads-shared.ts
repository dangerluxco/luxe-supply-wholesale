// Client-safe lead types + constants. Keep this free of firebase-admin /
// Node-only imports so "use client" components can import runtime values
// without dragging the Admin SDK into the browser bundle.

/** Lead source channels for the Create Lead dropdown. */
export const LEAD_SOURCES = [
  "LinkedIn",
  "Cold call",
  "Referral",
  "Trade show",
  "Instagram",
  "Website",
  "Other",
] as const;

export const LEAD_STATUSES = ["new", "contacted", "qualifying", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualifying: "Qualifying",
  won: "Won",
  lost: "Lost",
};

/** Qualification / readiness checks on a lead (Eelo "Tests available" analogue). */
export const LEAD_TEST_STATUSES = ["available", "scheduled", "passed", "failed", "waived"] as const;
export type LeadTestStatus = (typeof LEAD_TEST_STATUSES)[number];

export type LeadTest = {
  id: string;
  label: string;
  status: LeadTestStatus;
  note: string;
};

/** Workstreams tied to a lead (Eelo "Active projects" analogue). */
export const LEAD_PROJECT_STATUSES = ["active", "on_hold", "done", "cancelled"] as const;
export type LeadProjectStatus = (typeof LEAD_PROJECT_STATUSES)[number];

export type LeadProject = {
  id: string;
  name: string;
  status: LeadProjectStatus;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Default wholesale BD checklist seeded onto new leads. */
export const DEFAULT_LEAD_TESTS: Omit<LeadTest, "note">[] = [
  { id: "resale_cert", label: "Resale / wholesale certificate", status: "available" },
  { id: "tax_exempt", label: "Tax-exempt certificate", status: "available" },
  { id: "credit_app", label: "Credit application", status: "available" },
  { id: "sample_order", label: "Sample order eligibility", status: "available" },
  { id: "portal_trial", label: "Portal access trial", status: "available" },
  { id: "catalog_walkthrough", label: "Catalog walkthrough", status: "available" },
];

export type Lead = {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  industry: string;
  /** Lead source channel (LinkedIn, cold call, referral, …). */
  source: string;
  /** Who found/sourced this lead. */
  foundBy: string;
  estAnnualSpend: number | null;
  status: LeadStatus;
  assignedRepEmail: string | null;
  assignedRepName: string | null;
  routingReason: string | null;
  notes: string;
  testsAvailable: LeadTest[];
  activeProjects: LeadProject[];
  convertedBuyerId: string | null;
  convertedBuyerUsername: string | null;
  createdByEmail: string;
  createdByName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LeadActivityType =
  | "note"
  | "call"
  | "meeting"
  | "email"
  | "status_change"
  | "created"
  | "converted";

export type LeadActivity = {
  id: string;
  leadId: string;
  type: LeadActivityType;
  text: string;
  staffEmail: string;
  staffName: string;
  createdAt: string | null;
};
