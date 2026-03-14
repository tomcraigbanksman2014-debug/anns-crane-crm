import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./lib/supabase/server";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export default async function Page() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const email = String(user.email ?? "").trim().toLowerCase();
  const usernameFromEmail = fromAuthEmail(user.email ?? null).toLowerCase();

  const masterAdminEmail = String(process.env.MASTER_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();

  const isMaster = !!email && !!masterAdminEmail && email === masterAdminEmail;
  const metadataRole = String((user.user_metadata as any)?.role ?? "").toLowerCase();

  if (!isMaster) {
    const { data: operators } = await supabase
      .from("operators")
      .select("id, full_name, email, status")
      .eq("status", "active");

    const matchedOperator =
      (operators ?? []).find((op: any) => {
        const operatorEmail = String(op.email ?? "").trim().toLowerCase();
        const operatorName = String(op.full_name ?? "").trim().toLowerCase();

        return (
          (!!operatorEmail && operatorEmail === email) ||
          (!!operatorName && operatorName === usernameFromEmail)
        );
      }) ?? null;

    if (metadataRole === "operator" || matchedOperator) {
      redirect("/operator/jobs");
    }
  }

  redirect("/dashboard");
}
