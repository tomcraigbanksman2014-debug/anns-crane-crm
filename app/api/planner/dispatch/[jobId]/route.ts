import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

interface RouteContext {
  params: {
    jobId: string;
  };
}

export async function DELETE(_: Request, { params }: RouteContext) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("job_dispatches")
      .select("id, job_id, equipment_id, dispatch_date")
      .eq("job_id", params.jobId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (!existing) {
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase
      .from("job_dispatches")
      .delete()
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAuditEvent({
      action: "planner.dispatch.deleted",
      entityType: "job_dispatch",
      entityId: existing.id,
      meta: {
        jobId: existing.job_id,
        equipmentId: existing.equipment_id,
        dispatchDate: existing.dispatch_date,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Planner dispatch DELETE failed", error);
    return NextResponse.json(
      { error: "Failed to remove dispatch" },
      { status: 500 }
    );
  }
}
