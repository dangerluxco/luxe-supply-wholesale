import { redirect } from "next/navigation";

export default function ApplicationsRedirect() {
  redirect("/wholesaleportal/rep/clients?tab=applications");
}
