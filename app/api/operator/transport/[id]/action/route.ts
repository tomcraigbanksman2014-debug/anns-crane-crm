import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../../lib/audit";

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
  action?: "pickup_complete" | "delivery_complete";
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

    if (!["pickup_complete", "delivery_complete"].includes(action)) {
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
      .from("transport_jobs")
      .select(`
        id,
        transport_number,
        operator_id,
        status,
        pickup_completed_at,
        delivery_completed_at
      `)
      .eq("id", params.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Transport job not found." }, { status: 404 });
    }

    if (String(job.operator_id ?? "") !== String(operator.id)) {
      return NextResponse.json(
        { error: "This transport job is not assigned to you." },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {};

    if (action === "pickup_complete") {
      if (job.pickup_completed_at) {
        return NextResponse.json({ error: "Pickup has already been completed." }, { status: 400 });
      }

      updateData.pickup_completed_at = now;
      updateData.status = "in_progress";
    }

    if (action === "delivery_complete") {
      if (!job.pickup_completed_at) {
        return NextResponse.json(
          { error: "Pickup must be marked complete first." },
          { status: 400 }
        );
      }

      if (job.delivery_completed_at) {
        return NextResponse.json({ error: "Delivery has already been completed." }, { status: 400 });
      }

      updateData.delivery_completed_at = now;
      updateData.status = "completed";
    }

    const { error: updateError } = await admin
      .from("transport_jobs")
      .update(updateData)
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "operator_transport_action_updated",
      entity_type: "operator_transport_action",
      entity_id: params.id,
      meta: {
        transport_job_id: params.id,
        transport_number: job.transport_number ?? null,
        operator_id: operator.id,
        operator_name: operator.full_name ?? null,
        action,
        ...updateData,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update transport job action." },
      { status: 400 }
    );
  }
}
