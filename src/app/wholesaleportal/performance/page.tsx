import { redirect } from "next/navigation";

/**
 * `/wholesaleportal/performance` is the canonical URL for the performance
 * dashboard. The real page lives under `/wholesaleportal/rep/performance` so
 * it inherits the staff portal's shared auth gate + topbar/nav chrome.
 */
export default function PerformanceRedirect() {
  redirect("/wholesaleportal/rep/performance");
}
