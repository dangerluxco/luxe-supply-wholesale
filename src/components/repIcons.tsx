// Minimal 20x20 stroke icons for the staff sidebar nav — same convention as
// icons.tsx (currentColor, strokeWidth 1.4, aria-hidden).
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function DashboardIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="9" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="12" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </Svg>
  );
}

export function OrderRequestsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M5 3.5h10L16 6v9.5A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5V6L5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M4 6.5h12" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 9.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

export function ApplicationsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 3h5.5L15 6.5V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11.5 3v3.5H15" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7.3 10.5l1.3 1.3 2.1-2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function LeadsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="7" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 16c0-2.4 1.8-4 4-4s4 1.6 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.5 4.5 15.5 6.5 13.5 8.5M15.5 6.5H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ClientsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="7" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="13.5" cy="7" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.8 16c0-2.3 1.9-4 4.2-4s4.2 1.7 4.2 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11.5 12.5c1.9.2 3.2 1.6 3.2 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

export function CatalogIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="6" height="6" rx="0.75" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="4" width="6" height="6" rx="0.75" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="12" width="6" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="12" width="6" height="4" rx="0.75" stroke="currentColor" strokeWidth="1.4" />
    </Svg>
  );
}

export function BundlesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10 3 3 6.5 10 10l7-3.5L10 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M3 6.5V13l7 3.5V10M17 6.5V13l-7 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </Svg>
  );
}

export function FulfillmentIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M3.5 6.5h13v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M3.5 6.5 5 3.5h10l1.5 3M10 3.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 10h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

export function CurationIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 6.5v3.5l2.3 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function InvoicesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 3h8v14l-2-1.2L10 17l-2-1.2L6 17V3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 7h4M8 10h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

export function WishlistIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M10 16.5s-6-3.6-6-8A3.3 3.3 0 0 1 10 6.3 3.3 3.3 0 0 1 16 8.5c0 4.4-6 8-6 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PerformanceIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 17V3M3 17h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 13.5 9 9l2.5 2.5L16 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function StaffIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 16.5c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 3.5v1.7M10 14.8v1.7M16.5 10h-1.7M5.2 10H3.5M14.6 5.4l-1.2 1.2M6.6 13.4l-1.2 1.2M14.6 14.6l-1.2-1.2M6.6 6.6 5.4 5.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  );
}
