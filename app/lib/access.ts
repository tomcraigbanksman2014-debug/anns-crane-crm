import { createSupabaseServerClient } from "./supabase/server";
import { isMasterAdminEmail } from "./admin";

export type ResolvedRole = "admin" | "staff" | "operator" | "";

export type AccessContext = {
  user: any;
  role: ResolvedRole;
  settings: {
    allow_staff_create_bookings: boolean;
    allow_staff_create_customers: boolean;
    allow_staff_view_invoices: boolean;
  };
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export async function getAccessContext(): Promise<AccessContext> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = String(user?.email ?? "").trim().toLowerCase();
  const usernameFromEmail = fromAuthEmail(user?.email ?? null).toLowerCase();

  let role: ResolvedRole = "";

  if (user) {
    if (isMasterAdminEmail(email)) {
      role = "admin";
    } else {
      const metadataRole = String((user.user_metadata as any)?.role ?? "")
        .trim()
        .toLowerCase() as ResolvedRole;

      if (metadataRole === "admin" || metadataRole === "staff" || metadataRole === "operator") {
        role = metadataRole;
      }

      if (role !== "admin") {
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
              (!!operatorName && operatorName === usernameFromEmail) ||
              (!!usernameFromEmail &&
                !!operatorEmail &&
                operatorEmail.startsWith(`${usernameFromEmail}@`))
            );
          }) ?? null;

        if (matchedOperator) {
          role = "operator";
        }
      }
    }
  }

  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select(
      "allow_staff_create_bookings, allow_staff_create_customers, allow_staff_view_invoices"
    )
    .limit(1)
    .maybeSingle();

  return {
    user,
    role,
    settings: {
      allow_staff_create_bookings:
        settingsRow?.allow_staff_create_bookings ?? true,
      allow_staff_create_customers:
        settingsRow?.allow_staff_create_customers ?? true,
      allow_staff_view_invoices:
        settingsRow?.allow_staff_view_invoices ?? true,
    },
  };
}

export function canCreateBookings(ctx: AccessContext) {
  if (ctx.role === "admin") return true;
  if (ctx.role === "staff") return ctx.settings.allow_staff_create_bookings;
  return false;
}

export function canCreateCustomers(ctx: AccessContext) {
  if (ctx.role === "admin") return true;
  if (ctx.role === "staff") return ctx.settings.allow_staff_create_customers;
  return false;
}

export function canViewInvoices(ctx: AccessContext) {
  if (ctx.role === "admin") return true;
  if (ctx.role === "staff") return ctx.settings.allow_staff_view_invoices;
  return false;
}
