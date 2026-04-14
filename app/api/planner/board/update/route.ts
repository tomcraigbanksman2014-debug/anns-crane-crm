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

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function previousWorkingDate(dayIso: string, excludeWeekends: boolean) {
  const current = parseDateOnly(dayIso);
  if (!current) return dayIso;

  const cursor = new Date(current);
  do {
    cursor.setDate(cursor.getDate() - 1);
  } while (excludeWeekends && isWeekend(cursor));

  return isoDateLocal(cursor);
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

function timeOnlyFromTimestamp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = raw.match(/T(\d{2}:\d{2})/);
  if (match?.[1]) return match[1];

  const timeMatch = raw.match(/^(\d{2}:\d{2})/);
  if (timeMatch?.[1]) return timeMatch[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function cloneInsertPayload(existing: Record<string, any>, overrides: Record<string, any>) {
  const copy: Record<string, any> = {
    ...existing,
    ...overrides,
  };

  delete copy.id;
  delete copy.created_at;
  delete copy.jobs;
  delete copy.operators;
  delete copy.cranes;
  delete copy.vehicles;
  delete copy.equipment;
  delete copy.suppliers;
  delete copy.purchase_orders;

  return copy;
}

async function recalcJobDates(
  supabase: any,
  jobId: string,
  status: string | null
) {
  const [equipmentRowsRes, allocationRowsRes] = await Promise.all([
    supabase.from("job_equipment").select("start_date, end_date").eq("job_id", jobId),
    supabase.from("job_allocations").select("start_at, end_at").eq("job_id", jobId),
  ]);

  if (equipmentRowsRes.error) {
    throw new Error(equipmentRowsRes.error.message);
  }
  if (allocationRowsRes.error) {
    throw new Error(allocationRowsRes.error.message);
  }

  const bounds: string[] = [];

  for (const row of equipmentRowsRes.data ?? []) {
    const start = clean(row?.start_date);
    const end = clean(row?.end_date) ?? start;
    if (start) bounds.push(start);
    if (end) bounds.push(end);
  }

  for (const row of allocationRowsRes.data ?? []) {
    const start = dateOnlyFromTimestamp(row?.start_at);
    const end = dateOnlyFromTimestamp(row?.end_at) ?? start;
    if (start) bounds.push(start);
    if (end) bounds.push(end);
  }

  const unique = bounds.filter(Boolean).sort();
  const jobPayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (unique.length > 0) {
    jobPayload.job_date = unique[0];
    jobPayload.start_date = unique[0];
    jobPayload.end_date = unique[unique.length - 1];
  }

  if (status) {
    jobPayload.status = status;
  }

  const { error: jobError } = await supabase.from("jobs").update(jobPayload).eq("id", jobId);

  if (jobError) {
    throw new Error(jobError.message);
  }
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
    const sourceDay = clean(body.source_day);
    const jobDate = clean(body.job_date);
    const startDate = clean(body.start_date) ?? jobDate;
    const endDate = clean(body.end_date) ?? startDate;
    const startTime = clean(body.start_time);
    const endTime = clean(body.end_time);
    const status = clean(body.status);
    const plannerGroup = clean(body.planner_group);

    if (!jobId) {
      return NextResponse.json({ error: "Job id is required." }, { status: 400 });
    }

    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json(
        { error: "Job end date cannot be earlier than job start date." },
        { status: 400 }
      );
    }

    const { data: linkedJob, error: linkedJobError } = await supabase
      .from("jobs")
      .select("id, exclude_weekends")
      .eq("id", jobId)
      .single();

    if (linkedJobError || !linkedJob) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const excludeWeekends = Boolean(linkedJob.exclude_weekends);

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
        const { data: existing, error: existingError } = await supabase
          .from("job_allocations")
          .select("*")
          .eq("id", allocationId)
          .single();

        if (existingError || !existing) {
          return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
        }

        if (!craneId && plannerGroup === "labour_only") {
          return NextResponse.json(
            {
              error:
                "Current schema does not support labour-only rows in job_allocations. Use job_equipment for labour-only allocations.",
            },
            { status: 400 }
          );
        }

        const existingStart = dateOnlyFromTimestamp(existing.start_at);
        const existingEnd =
          dateOnlyFromTimestamp(existing.end_at) ?? dateOnlyFromTimestamp(existing.start_at);
        const splitFromDay = sourceDay ?? existingStart;
        const shouldSplit =
          Boolean(splitFromDay) &&
          Boolean(existingStart) &&
          Boolean(existingEnd) &&
          String(splitFromDay) > String(existingStart) &&
          String(splitFromDay) <= String(existingEnd);

        if (shouldSplit) {
          const keptEnd = previousWorkingDate(String(splitFromDay), excludeWeekends);

          const { error: keepError } = await supabase
            .from("job_allocations")
            .update({
              end_at: buildTimestamp(
                keptEnd,
                timeOnlyFromTimestamp(existing.end_at) ?? endTime ?? startTime,
                "23:59"
              ),
            })
            .eq("id", allocationId);

          if (keepError) {
            return NextResponse.json({ error: keepError.message }, { status: 400 });
          }

          const movedPayload = cloneInsertPayload(existing, {
            operator_id: operatorId,
            crane_id: craneId,
            start_at: buildTimestamp(startDate, startTime, "00:00"),
            end_at: buildTimestamp(endDate, endTime ?? startTime, "23:59"),
          });

          if (craneId) {
            movedPayload.asset_type = "crane";
          }

          const { error: insertError } = await supabase
            .from("job_allocations")
            .insert(movedPayload);

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
        const { data: existing, error: existingError } = await supabase
          .from("job_equipment")
          .select("*")
          .eq("id", allocationId)
          .single();

        if (existingError || !existing) {
          return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
        }

        const existingStart = clean(existing.start_date);
        const existingEnd = clean(existing.end_date) ?? existingStart;
        const splitFromDay = sourceDay ?? existingStart;
        const shouldSplit =
          Boolean(splitFromDay) &&
          Boolean(existingStart) &&
          Boolean(existingEnd) &&
          String(splitFromDay) > String(existingStart) &&
          String(splitFromDay) <= String(existingEnd);

        if (shouldSplit) {
          const keptEnd = previousWorkingDate(String(splitFromDay), excludeWeekends);

          const { error: keepError } = await supabase
            .from("job_equipment")
            .update({
              end_date: keptEnd,
              updated_at: new Date().toISOString(),
            })
            .eq("id", allocationId);

          if (keepError) {
            return NextResponse.json({ error: keepError.message }, { status: 400 });
          }

          const movedPayload = cloneInsertPayload(existing, {
            operator_id: operatorId,
            crane_id: craneId,
            start_date: startDate,
            end_date: endDate,
            start_time: startTime,
            end_time: endTime,
            updated_at: new Date().toISOString(),
          });

          if (craneId) {
            movedPayload.asset_type = "crane";
          } else if (plannerGroup === "labour_only") {
            movedPayload.asset_type = "other";
          }

          const { error: insertError } = await supabase
            .from("job_equipment")
            .insert(movedPayload);

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

      await recalcJobDates(supabase, jobId, status);
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
