import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

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

type Payload = {
  action?: "start" | "arrive" | "lift_complete" | "complete";
};

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

function jobIsAssignedToOperator(job: any, operatorId: string) {
  if (!job) return false;

  if (String(job.operator_id ?? "") === operatorId) return true;
  if (String(job.main_operator_id ?? "") === operatorId) return true;

  const allocations = Array.isArray(job.job_equipment) ? job.job_equipment : [];
  return allocations.some((row: any) => String(row?.operator_id ?? "") === operatorId);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const admin = getAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;
    const action = String(body.action ?? "").trim();

    if (!["start", "arrive", "lift_complete", "complete"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const authEmail = String(user.email ?? "").trim().toLowerCase();

    const { data: operators, error: operatorsError } = await admin
      .from("operators")
      .select("id, full_name, email, status")
      .eq("status", "active");

    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }

    const operator =
      (operators ?? []).find((op: any) => matchesOperatorLogin(authEmail, op)) ?? null;

    if (!operator) {
      return NextResponse.json(
        { error: "No operator record linked to this login." },
        { status: 403 }
      );
    }

    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select(`
        id,
        job_number,
        status,
        operator_id,
        main_operator_id,
        job_equipment (
          id,
          operator_id
        )
      `)
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    if (!jobIsAssignedToOperator(job, operator.id)) {
      return NextResponse.json(
        { error: "This job is not assigned to you." },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {};

    if (action === "start") {
      updateData.started_at = now;
      updateData.status = "in_progress";
    }

    if (action === "arrive") {
      updateData.arrived_on_site_at = now;
      updateData.status = "in_progress";
    }

    if (action === "lift_complete") {
      updateData.lift_completed_at = now;
      updateData.status = "in_progress";
    }

    if (action === "complete") {
      updateData.completed_at = now;
      updateData.status = "completed";
    }

    const { error: updateError } = await admin
      .from("jobs")
      .update(updateData)
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "operator_job_action_updated",
      entity_type: "operator_job_action",
      entity_id: params.id,
      meta: {
        job_id: params.id,
        job_number: job.job_number ?? null,
        operator_id: operator.id,
        operator_name: operator.full_name ?? null,
        action,
        ...updateData,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update job action." },
      { status: 400 }
    );
  }
}
