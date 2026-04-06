import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

async function safeCount(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: string,
  column: string,
  value: string
) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const form = await req.formData();
  const id = String(form.get("id") || "");

  if (!id) {
    return NextResponse.redirect(new URL("/customers", req.url));
  }

  const { data: customer } = await supabase
    .from("clients")
    .select("id, company_name")
    .eq("id", id)
    .single();

  const [
    bookingCount,
    jobCount,
    transportJobCount,
    quoteCount,
    correspondenceCount,
    importedHistoryCount,
    workflowTaskCount,
    convertedLeadCount,
  ] = await Promise.all([
    safeCount(supabase, "bookings", "client_id", id),
    safeCount(supabase, "jobs", "client_id", id),
    safeCount(supabase, "transport_jobs", "client_id", id),
    safeCount(supabase, "quotes", "client_id", id),
    safeCount(supabase, "customer_correspondence", "client_id", id),
    safeCount(supabase, "imported_job_history", "matched_client_id", id),
    safeCount(supabase, "sales_workflow_tasks", "client_id", id),
    safeCount(supabase, "sales_leads", "converted_client_id", id),
  ]);

  const hasLinkedData =
    bookingCount > 0 ||
    jobCount > 0 ||
    transportJobCount > 0 ||
    quoteCount > 0 ||
    correspondenceCount > 0 ||
    importedHistoryCount > 0 ||
    workflowTaskCount > 0 ||
    convertedLeadCount > 0;

  if (hasLinkedData) {
    return NextResponse.redirect(new URL(`/customers/${id}/delete`, req.url));
  }

  const { error: deleteError } = await supabase.from("clients").delete().eq("id", id);

  if (deleteError) {
    return NextResponse.redirect(new URL(`/customers/${id}/delete`, req.url));
  }

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: fromAuthEmail(user.email ?? null) || null,
    action: "customer_deleted",
    entity_type: "customer",
    entity_id: id,
    meta: {
      company_name: customer?.company_name ?? null,
    },
  });

  return NextResponse.redirect(new URL("/customers", req.url));
}
