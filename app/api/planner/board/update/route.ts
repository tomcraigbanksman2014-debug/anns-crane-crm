import { NextResponse } from "next/server";
import { requireApiUser } from "../../../../lib/apiAuth";

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function buildTimestamp(dateValue: string | null, timeValue: string | null, fallbackTime: string) {
  if (!dateValue) return null;
  const time = timeValue ?? fallbackTime;
  return `${dateValue}T${time}:00`;
}

function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDateLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previousDate(dateValue: string | null | undefined) {
  const parsed = parseDateOnly(dateValue);
  if (!parsed) return null;
  parsed.setDate(parsed.getDate() - 1);
  return isoDateLocal(parsed);
}

function dateOnlyFromTimestamp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const fallback = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : null;
}

async function recalculateJobDates(
  supabase: any,
  jobId: string,
  fallbackStart: string | null,
  fallbackEnd: string | null
) {
  const [equipmentRowsRes, allocationRowsRes] = await Promise.all([
    supabase.from("job_equipment").select("start_date,end_date").eq("job_id", jobId),
    supabase.from("job_allocations").select("start_at,end_at").eq("job_id", jobId),
  ]);

  if (equipmentRowsRes.error) {
    throw new Error(equipmentRowsRes.error.message);
  }

  if (allocationRowsRes.error) {
    throw new Error(allocationRowsRes.error.message);
  }

  const dates = [
    ...(equipmentRowsRes.data ?? []).flatMap((row: any) => [
      clean(row?.start_date),
      clean(row?.end_date) ?? clean(row?.start_date),
    ]),
    ...(allocationRowsRes.data ?? []).flatMap((row: any) => {
      const start = dateOnlyFromTimestamp(row?.start_at);
      const end = dateOnlyFromTimestamp(row?.end_at) ?? start;
      return [start, end];
    }),
  ].filter(Boolean) as string[];

  if (dates.length === 0) {
    return {
      start_date: fallbackStart,
      end_date: fallbackEnd ?? fallbackStart,
    };
  }

  dates.sort();

  return {
    start_date: dates[0] ?? fallbackStart,
    end_date: dates[dates.length - 1] ?? fallbackEnd ?? fallbackStart,
  };
}

export async function POST(req: Request) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const allocationId = clean(body.allocation_id);
    const allocationSource = clean(body.allocation_source);
    const jobId = clean(body.job_id);
    const operatorId = body.operator_id === "" ? null : clean(body.operator_id);
    const craneId = body.equipment_id === "" ? null : clean(body.equipment_id);
    const jobDate = clean(body.job_date);
    const startDate = clean(body.start_date) ?? jobDate;
    const endDate = clean(body.end_date) ?? startDate;
    const startTime = clean(body.start_time);
    const endTime = clean(body.end_time);
    const status = clean(body.status);
    const plannerGroup = clean(body.planner_group);
    const sourceDay = clean(body.source_day);
    const movedDays = Math.max(Number(body.moved_days ?? 0), 0);

    if (!jobId) {
      return NextResponse.json({ error: "Job id is required." }, { status: 400 });
    }

    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json(
        { error: "Job end date cannot be earlier than job start date." },
        { status: 400 }
      );
    }

    if (allocationId) {
      let resolvedAllocationSource = allocationSource;

      if (!resolvedAllocationSource) {
        const [jobAllocationsLookup, jobEquipmentLookup] = await Promise.all([
          supabase.from("job_allocations").select("id").eq("id", allocationId).maybeSingle(),
          supabase.from("job_equipment").select("id").eq("id", allocationId).maybeSingle(),
        ]);

        if (jobAllocationsLookup.data?.id) {
          resolvedAllocationSource = "job_allocations";
        } else if (jobEquipmentLookup.data?.id) {
          resolvedAllocationSource = "job_equipment";
        }
      }

      if (!resolvedAllocationSource) {
        return NextResponse.json(
          { error: "Could not determine allocation source." },
          { status: 400 }
        );
      }

      if (resolvedAllocationSource === "job_allocations") {
        if (!craneId && plannerGroup === "labour_only") {
          return NextResponse.json(
            {
              error:
                "Current schema does not support labour-only rows in job_allocations. Use job_equipment for labour-only allocations.",
            },
            { status: 400 }
          );
        }

        const existingRes = await supabase
          .from("job_allocations")
          .select("job_id,asset_type,crane_id,vehicle_id,equipment_id,operator_id,start_at,end_at,agreed_cost,supplier_reference,notes")
          .eq("id", allocationId)
          .single();

        if (existingRes.error || !existingRes.data) {
          return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
        }

        const existing = existingRes.data;
        const existingStartDate = dateOnlyFromTimestamp(existing.start_at);
        const existingEndDate = dateOnlyFromTimestamp(existing.end_at) ?? existingStartDate;
        const shouldSplit = Boolean(
          sourceDay &&
            movedDays > 0 &&
            existingStartDate &&
            existingEndDate &&
            sourceDay > existingStartDate &&
            sourceDay <= existingEndDate
        );

        if (shouldSplit) {
          const oldEndDate = previousDate(sourceDay);
          const { error: shrinkError } = await supabase
            .from("job_allocations")
            .update({
              end_at: buildTimestamp(oldEndDate, endTime ?? startTime, "23:59"),
              operator_id: operatorId,
            })
            .eq("id", allocationId);

          if (shrinkError) {
            return NextResponse.json({ error: shrinkError.message }, { status: 400 });
          }

          const insertPayload: Record<string, any> = {
            job_id: existing.job_id,
            asset_type: craneId ? "crane" : existing.asset_type,
            crane_id: craneId,
            vehicle_id: existing.vehicle_id,
            equipment_id: existing.equipment_id,
            operator_id: operatorId,
            start_at: buildTimestamp(startDate, startTime, "00:00"),
            end_at: buildTimestamp(endDate, endTime ?? startTime, "23:59"),
            agreed_cost: existing.agreed_cost,
            supplier_reference: existing.supplier_reference,
            notes: existing.notes,
          };

          const { error: insertError } = await supabase
            .from("job_allocations")
            .insert(insertPayload);

          if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 400 });
          }
        } else {
          const allocationPayload: Record<string, any> = {
            operator_id: operatorId,
            crane_id: craneId,
          };

          if (startDate) {
            allocationPayload.start_at = buildTimestamp(startDate, startTime, "00:00");
          }
          if (endDate) {
            allocationPayload.end_at = buildTimestamp(endDate, endTime ?? startTime, "23:59");
          }

          if (craneId) {
            allocationPayload.asset_type = "crane";
          }

          const { error: allocationError } = await supabase
            .from("job_allocations")
            .update(allocationPayload)
            .eq("id", allocationId);

          if (allocationError) {
            return NextResponse.json({ error: allocationError.message }, { status: 400 });
          }
        }
      } else {
        const existingRes = await supabase
          .from("job_equipment")
          .select("job_id,asset_type,crane_id,vehicle_id,equipment_id,operator_id,supplier_id,purchase_order_id,item_name,source_type,start_date,end_date,start_time,end_time,agreed_cost,agreed_sell_rate,supplier_cost,supplier_reference,notes")
          .eq("id", allocationId)
          .single();

        if (existingRes.error || !existingRes.data) {
          return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
        }

        const existing = existingRes.data;
        const existingStartDate = clean(existing.start_date);
        const existingEndDate = clean(existing.end_date) ?? existingStartDate;
        const shouldSplit = Boolean(
          sourceDay &&
            movedDays > 0 &&
            existingStartDate &&
            existingEndDate &&
            sourceDay > existingStartDate &&
            sourceDay <= existingEndDate
        );

        if (shouldSplit) {
          const oldEndDate = previousDate(sourceDay);
          const { error: shrinkError } = await supabase
            .from("job_equipment")
            .update({
              end_date: oldEndDate,
              updated_at: new Date().toISOString(),
            })
            .eq("id", allocationId);

          if (shrinkError) {
            return NextResponse.json({ error: shrinkError.message }, { status: 400 });
          }

          const insertPayload: Record<string, any> = {
            job_id: existing.job_id,
            asset_type: craneId ? "crane" : plannerGroup === "labour_only" ? "other" : existing.asset_type,
            crane_id: craneId,
            vehicle_id: existing.vehicle_id,
            equipment_id: existing.equipment_id,
            operator_id: operatorId,
            supplier_id: existing.supplier_id,
            purchase_order_id: existing.purchase_order_id,
            item_name: existing.item_name,
            source_type: existing.source_type,
            start_date: startDate,
            end_date: endDate,
            start_time: startTime ?? existing.start_time,
            end_time: endTime ?? existing.end_time,
            agreed_cost: existing.agreed_cost,
            agreed_sell_rate: existing.agreed_sell_rate,
            supplier_cost: existing.supplier_cost,
            supplier_reference: existing.supplier_reference,
            notes: existing.notes,
            updated_at: new Date().toISOString(),
          };

          const { error: insertError } = await supabase
            .from("job_equipment")
            .insert(insertPayload);

          if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 400 });
          }
        } else {
          const allocationPayload: Record<string, any> = {
            operator_id: operatorId,
            crane_id: craneId,
            updated_at: new Date().toISOString(),
          };

          if (startDate) allocationPayload.start_date = startDate;
          if (endDate) allocationPayload.end_date = endDate;
          if (startTime !== null) allocationPayload.start_time = startTime;
          if (endTime !== null) allocationPayload.end_time = endTime;

          if (craneId) {
            allocationPayload.asset_type = "crane";
          } else if (plannerGroup === "labour_only") {
            allocationPayload.asset_type = "other";
          }

          const { error: allocationError } = await supabase
            .from("job_equipment")
            .update(allocationPayload)
            .eq("id", allocationId);

          if (allocationError) {
            return NextResponse.json({ error: allocationError.message }, { status: 400 });
          }
        }
      }

      const dateBounds = await recalculateJobDates(supabase, jobId, startDate, endDate);
      const jobPayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (dateBounds.start_date) {
        jobPayload.job_date = dateBounds.start_date;
        jobPayload.start_date = dateBounds.start_date;
      }
      if (dateBounds.end_date) {
        jobPayload.end_date = dateBounds.end_date;
      }
      if (status) {
        jobPayload.status = status;
      }

      const { error: jobError } = await supabase
        .from("jobs")
        .update(jobPayload)
        .eq("id", jobId);

      if (jobError) {
        return NextResponse.json({ error: jobError.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    const jobPayload: Record<string, any> = {
      operator_id: operatorId,
      crane_id: craneId,
      updated_at: new Date().toISOString(),
    };

    if (jobDate) jobPayload.job_date = jobDate;
    if (startDate) {
      jobPayload.start_date = startDate;
      jobPayload.job_date = startDate;
    }
    if (endDate) jobPayload.end_date = endDate;
    if (startTime !== null) jobPayload.start_time = startTime;
    if (endTime !== null) jobPayload.end_time = endTime;
    if (status) jobPayload.status = status;

    const { error: jobError } = await supabase
      .from("jobs")
      .update(jobPayload)
      .eq("id", jobId);

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not update planner item." },
      { status: 400 }
    );
  }
}
