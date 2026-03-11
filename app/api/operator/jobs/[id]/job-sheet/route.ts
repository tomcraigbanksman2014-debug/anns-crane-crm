import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../../lib/audit";

type Payload = {
  travel_hours?: number | string | null;
  break_hours?: number | string | null;
  overtime_hours?: number | string | null;
  operator_job_notes?: string | null;
  customer_signoff_name?: string | null;
  operator_signoff_name?: string | null;
  submit?: boolean;
};

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toText(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function matchesOperator(userEmail: string, operator: any) {
  const authEmail = String(userEmail ?? "").trim().toLowerCase();
  const authUsername = authEmail.includes("@") ? authEmail.split("@")[0] : authEmail;
  const operatorEmail = String(operator?.email ?? "").trim().toLowerCase();
  const operatorName = String(operator?.full_name ?? "").trim().toLowerCase();

  return (
    operatorEmail === authEmail ||
    operatorName === authUsername ||
    (!!authUsername && operatorEmail.startsWith(`${authUsername}@`))
  );
}

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

    const { data: operators, error: operatorsError } = await supabase
      .from("operators")
      .select("id, full_name, email, status")
      .eq("status", "active");

    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }

    const operator = (operators ?? []).find((op: any) =>
      matchesOperator(String(user.email ?? ""), op)
    );

    if (!operator) {
      return NextResponse.json(
        { error: "No operator record linked to this login." },
        { status: 403 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, job_number, operator_id")
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

    const body = (await req.json().catch(() => ({}))) as Payload;

    const updateData: Record<string, any> = {
      travel_hours: toNumber(body.travel_hours),
      break_hours: toNumber(body.break_hours),
      overtime_hours: toNumber(body.overtime_hours),
      operator_job_notes: toText(body.operator_job_notes),
      customer_signoff_name: toText(body.customer_signoff_name),
      operator_signoff_name: toText(body.operator_signoff_name),
    };

    if (body.submit === true) {
      updateData.submitted_to_office_at = new Date().toISOString();
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
      entity_type: "operator_job_sheet",
      entity_id: params.id,
      meta: {
        job_id: params.id,
        job_number: job.job_number ?? null,
        operator_id: operator.id,
        operator_name: operator.full_name ?? null,
        ...updateData,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not save operator job sheet." },
      { status: 400 }
    );
  }
}
