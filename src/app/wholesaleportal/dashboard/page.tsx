import { redirect } from "next/navigation";

/**
 * `/wholesaleportal/dashboard` is the canonical URL for the live staff
 * dashboard. The actual page lives under `/wholesaleportal/rep/dashboard` so it
 * inherits the staff portal's shared auth gate + topbar/nav chrome, matching
 * every other staff page — this route just keeps the requested URL working.
 */
export default function DashboardRedirect() {
  redirect("/wholesaleportal/rep/dashboard");
}
