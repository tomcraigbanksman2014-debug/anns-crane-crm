import { redirect } from "next/navigation";
import { getAccessContext } from "./lib/access";

export default async function Page() {
  const access = await getAccessContext();

  if (!access.user) {
    redirect("/login");
  }

  if (access.role === "operator") {
    redirect("/operator/jobs");
  }

  redirect("/dashboard");
}
