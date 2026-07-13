import { redirect } from "next/navigation";
import { getSession, homeForRole } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  redirect(session ? homeForRole(session.role) : "/wholesale/sign-in");
}
