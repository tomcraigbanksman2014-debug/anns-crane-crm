import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

type Payload = {
  action?: "start" | "arrive" | "lift_complete" | "complete";
};

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();

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
    const authUsername = authEmail.includes("@")
      ? authEmail.split("@")[0]
      : authEmail;

    const { data: operators, error: operatorsError } = await supabase
      .from("operators")
      .select("id, full_name, email, status")
      .eq("status", "active");

    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }

    const operator =
      (operators ?? []).find((op: any) => {
        const operatorEmail = String(op.email ?? "").trim().toLowerCase();
        const operatorName = String(op.full_name ?? "").trim().toLowerCase();

        return (
          operatorEmail === authEmail ||
          operatorName === authUsername ||
          (!!authUsername && operatorEmail.startsWith(`${authUsername}@`))
        );
      }) ?? null;

    if (!operator) {
      return NextResponse.json(
        { error: "No operator record linked to this login." },
        { status: 403 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, operator_id, job_number, status")
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    if (job.operator_id !== operator.id) {
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

    const { error: updateError } = await supabase
      .from("jobs")
      .update(updateData)
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "update",
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
