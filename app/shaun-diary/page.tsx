import ClientShell from "../ClientShell";
import { getAccessContext } from "../lib/access";
import { redirect } from "next/navigation";
import ShaunDiaryClient from "./ShaunDiaryClient";

export default async function ShaunDiaryPage() {
  const access = await getAccessContext();
  if (!access.user) redirect("/login");
  if (access.role !== "admin" && access.role !== "staff") redirect("/operator/jobs");
  return <ClientShell><ShaunDiaryClient /></ClientShell>;
}
