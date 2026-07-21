import { redirect } from "next/navigation";

/**
 * `/wholesaleportal/leads` is the canonical URL for the lead pipeline. The real
 * page lives under `/wholesaleportal/rep/leads` so it inherits the staff
 * portal's shared auth gate + topbar/nav chrome.
 */
export default function LeadsRedirect() {
  redirect("/wholesaleportal/rep/leads");
}
