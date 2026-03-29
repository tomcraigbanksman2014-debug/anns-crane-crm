import { createClient } from "@supabase/supabase-js";
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

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function matchesOperatorLogin(authEmail: string, operator: any) {
  const email = String(authEmail ?? "").trim().toLowerCase();
  const username = email.includes("@") ? email.split("@")[0] : email;
  const operatorEmail = String(operator?.email ?? "").trim().toLowerCase();
  const operatorEmailUsername = operatorEmail.includes("@")
    ? operatorEmail.split("@")[0]
    : operatorEmail;
  const operatorName = String(operator?.full_name ?? "").trim().toLowerCase();

  return (
    (!!operatorEmail && operatorEmail === email) ||
    (!!operatorEmailUsername && operatorEmailUsername === username) ||
    (!!operatorName && operatorName === username)
  );
}

export async function getAccessContext(): Promise<AccessContext> {
  const supabase = createSupabaseServerClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = String(user?.email ?? "").trim().toLowerCase();

  let role: ResolvedRole = "";

  if (user) {
    if (isMasterAdminEmail(email)) {
      role = "admin";
    } else {
      const metadataRole = String((user.user_metadata as any)?.role ?? "")
        .trim()
        .toLowerCase() as ResolvedRole;

      if (
        metadataRole === "admin" ||
        metadataRole === "staff" ||
        metadataRole === "operator"
      ) {
        role = metadataRole;
      }

      if (role !== "admin") {
        const { data: operators } = await admin
          .from("operators")
          .select("id, full_name, email, status")
          .eq("status", "active");

        const matchedOperator =
          (operators ?? []).find((op: any) => matchesOperatorLogin(email, op)) ?? null;

        if (matchedOperator) {
          role = "operator";
        }
      }
    }
  }

  const { data: settingsRow } = await admin
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
