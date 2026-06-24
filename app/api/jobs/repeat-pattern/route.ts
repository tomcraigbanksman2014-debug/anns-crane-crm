import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";
import { hasRequiredCraneJobSiteContact, CRANE_JOB_SITE_CONTACT_ERROR } from "../../../lib/jobContactValidation";

const WEEKDAY_META: Record<string, { label: string; shortLabel: string; index: number }> = {
  monday: { label: "Monday", shortLabel: "Mon", index: 0 },
  tuesday: { label: "Tuesday", shortLabel: "Tue", index: 1 },
  wednesday: { label: "Wednesday", shortLabel: "Wed", index: 2 },
  thursday: { label: "Thursday", shortLabel: "Thu", index: 3 },
  friday: { label: "Friday", shortLabel: "Fri", index: 4 },
  saturday: { label: "Saturday", shortLabel: "Sat", index: 5 },
  sunday: { label: "Sunday", shortLabel: "Sun", index: 6 },
};

type ActiveDay = {
  key: string;
  label: string;
  shortLabel: string;
  index: number;
  rate: number;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrZero(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const n = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseDateOnly(value: unknown) {
  const raw = clean(value).slice(0, 10);
  const parts = raw.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function formatDateOnly(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekdayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

function shiftDate(value: unknown, days: number) {
  const date = parseDateOnly(value);
  if (!date) return value ?? null;
  return formatDateOnly(addDays(date, days));
}

function makeActiveDays(rawWeekdays: any): ActiveDay[] {
  const rows = Array.isArray(rawWeekdays) ? rawWeekdays : [];
  const activeDays: ActiveDay[] = [];

  for (const row of rows) {
    const key = clean(row?.key).toLowerCase();
    const meta = WEEKDAY_META[key];
    if (!meta || !row?.enabled) continue;

    activeDays.push({
      key,
      label: meta.label,
      shortLabel: meta.shortLabel,
      index: meta.index,
      rate: numberOrZero(row?.rate),
    });
  }

  return activeDays.sort((a, b) => a.index - b.index);
}

function buildCommercialLines(activeDays: ActiveDay[], occurrenceDates: Record<string, string>, siteName: string | null | undefined) {
  return activeDays.map((day) => ({
    id: `repeat-${day.key}`,
    line_type: "sell",
    item: `${day.label} visit`,
    description: siteName ? `${siteName} - ${day.label}` : `${day.label} job visit`,
    date_from: occurrenceDates[day.key],
    date_to: occurrenceDates[day.key],
    quantity: "1",
    rate: day.rate.toFixed(2),
    amount: day.rate,
    notes: "Created from repeat job pattern",
  }));
}

function occurrenceFromPattern(sourceStart: Date, activeDays: ActiveDay[], repeatEveryWeeks: number, occurrenceIndex: number) {
  const firstDay = activeDays[0];
  const lastDay = activeDays[activeDays.length - 1];
  const sourceAnchor = addDays(sourceStart, firstDay.index - weekdayIndex(sourceStart));
  const weekOffsetDays = occurrenceIndex * repeatEveryWeeks * 7;
  const dates: Record<string, string> = {};

  for (const day of activeDays) {
    dates[day.key] = formatDateOnly(addDays(sourceAnchor, day.index - firstDay.index + weekOffsetDays));
  }

  return {
    startDate: dates[firstDay.key],
    endDate: dates[lastDay.key],
    dates,
    weekTotal: numberOrZero(activeDays.reduce((sum, day) => sum + day.rate, 0)),
  };
}

function makeVisitRows(params: {
  jobType: "crane";
  jobId: string;
  groupId: string;
  occurrenceNumber: number;
  activeDays: ActiveDay[];
  dates: Record<string, string>;
}) {
  return params.activeDays.map((day) => ({
    job_type: params.jobType,
    job_id: params.jobId,
    repeat_group_id: params.groupId,
    repeat_occurrence_number: params.occurrenceNumber,
    visit_date: params.dates[day.key],
    weekday: day.key,
    charge: day.rate,
    invoice_status: "Not Invoiced",
    notes: "Created from repeat job pattern",
    updated_at: new Date().toISOString(),
  }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const jobId = clean(body?.job_id);

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
    }

    const activeDays = makeActiveDays(body?.weekdays);
    if (activeDays.length === 0) {
      return NextResponse.json({ error: "Choose at least one active day." }, { status: 400 });
    }

    if (activeDays.every((day) => day.rate <= 0)) {
      return NextResponse.json({ error: "Add daily rates before creating the repeat pattern." }, { status: 400 });
    }

    const repeatWeeks = clampInteger(body?.repeat_weeks, 6, 1, 52);
    const repeatEveryWeeks = clampInteger(body?.repeat_every_weeks, 1, 1, 12);
    const mode = clean(body?.mode) === "create_all_from_source_date" ? "create_all_from_source_date" : "keep_source_as_week_1";
    const includeSourceAsWeekOne = mode === "keep_source_as_week_1";

    const { supabase, response, user } = await requireApiUser();
    if (response) return response;

    const { data: job, error: readError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (readError || !job) {
      return NextResponse.json({ error: readError?.message || "Job not found." }, { status: 404 });
    }

    if (!hasRequiredCraneJobSiteContact(job)) {
      return NextResponse.json(
        { error: `${CRANE_JOB_SITE_CONTACT_ERROR} Add the site contact to the source job before creating repeat jobs.` },
        { status: 400 }
      );
    }

    const sourceStart = parseDateOnly(job.start_date ?? job.job_date) ?? new Date();
    const { data: allocations, error: allocationsError } = await supabase
      .from("job_equipment")
      .select("*")
      .eq("job_id", jobId);

    if (allocationsError) {
      return NextResponse.json({ error: allocationsError.message }, { status: 400 });
    }

    const { data: group, error: groupError } = await supabase
      .from("job_repeat_groups")
      .insert({
        source_job_type: "crane",
        source_job_table: "jobs",
        source_job_id: jobId,
        pattern_type: "weekly_multi_day",
        repeat_every_weeks: repeatEveryWeeks,
        repeat_count: repeatWeeks,
        active_weekdays: activeDays.map((day) => day.key),
        include_source_job: includeSourceAsWeekOne,
        daily_rates: activeDays.map((day) => ({ weekday: day.key, rate: day.rate })),
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (groupError || !group?.id) {
      return NextResponse.json({ error: groupError?.message || "Could not create repeat group. Run the repeat-pattern SQL first." }, { status: 400 });
    }

    const createdIds: string[] = [];
    const sourceOccurrence = occurrenceFromPattern(sourceStart, activeDays, repeatEveryWeeks, 0);

    if (includeSourceAsWeekOne) {
      const sourceLines = buildCommercialLines(activeDays, sourceOccurrence.dates, job.site_name);
      const { error: sourceUpdateError } = await supabase
        .from("jobs")
        .update({
          repeat_group_id: group.id,
          repeat_occurrence_number: 1,
          start_date: sourceOccurrence.startDate,
          end_date: sourceOccurrence.endDate,
          job_date: sourceOccurrence.startDate,
          price_mode: "full_job",
          price_per_day: null,
          price: sourceOccurrence.weekTotal,
          agreed_sell_rate: sourceOccurrence.weekTotal,
          invoice_subtotal: sourceOccurrence.weekTotal,
          invoice_vat: numberOrZero(sourceOccurrence.weekTotal * 0.2),
          total_invoice: numberOrZero(sourceOccurrence.weekTotal * 1.2),
          commercial_breakdown: sourceLines,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (sourceUpdateError) {
        return NextResponse.json({ error: sourceUpdateError.message }, { status: 400 });
      }

      const { error: sourceVisitDeleteError } = await supabase
        .from("job_daily_visit_rates")
        .delete()
        .eq("job_type", "crane")
        .eq("job_id", jobId)
        .eq("repeat_group_id", group.id);

      if (sourceVisitDeleteError) {
        return NextResponse.json({ error: sourceVisitDeleteError.message }, { status: 400 });
      }

      const { error: sourceVisitError } = await supabase
        .from("job_daily_visit_rates")
        .insert(makeVisitRows({
          jobType: "crane",
          jobId,
          groupId: group.id,
          occurrenceNumber: 1,
          activeDays,
          dates: sourceOccurrence.dates,
        }));

      if (sourceVisitError) {
        return NextResponse.json({ error: sourceVisitError.message }, { status: 400 });
      }
    }

    const firstOccurrenceNumber = includeSourceAsWeekOne ? 2 : 1;
    const lastOccurrenceNumber = repeatWeeks;

    for (let occurrenceNumber = firstOccurrenceNumber; occurrenceNumber <= lastOccurrenceNumber; occurrenceNumber += 1) {
      const occurrenceIndex = occurrenceNumber - 1;
      const occurrence = occurrenceFromPattern(sourceStart, activeDays, repeatEveryWeeks, occurrenceIndex);
      const commercialLines = buildCommercialLines(activeDays, occurrence.dates, job.site_name);
      const insertRow: Record<string, any> = { ...job };

      delete insertRow.id;
      delete insertRow.job_number;
      delete insertRow.created_at;
      delete insertRow.updated_at;

      insertRow.repeat_group_id = group.id;
      insertRow.repeat_occurrence_number = occurrenceNumber;
      insertRow.start_date = occurrence.startDate;
      insertRow.end_date = occurrence.endDate;
      insertRow.job_date = occurrence.startDate;
      insertRow.price_mode = "full_job";
      insertRow.price_per_day = null;
      insertRow.price = occurrence.weekTotal;
      insertRow.agreed_sell_rate = occurrence.weekTotal;
      insertRow.invoice_status = "Not Invoiced";
      insertRow.invoice_number = null;
      insertRow.invoice_created_at = null;
      insertRow.invoice_due_at = null;
      insertRow.invoice_subtotal = occurrence.weekTotal;
      insertRow.invoice_vat = numberOrZero(occurrence.weekTotal * 0.2);
      insertRow.total_invoice = numberOrZero(occurrence.weekTotal * 1.2);
      insertRow.commercial_breakdown = commercialLines;
      insertRow.updated_at = new Date().toISOString();
      insertRow.notes = [job.notes ?? "", `Repeated pattern week ${occurrenceNumber} of ${repeatWeeks}`].filter(Boolean).join("\n");

      const { data: created, error: createError } = await supabase
        .from("jobs")
        .insert(insertRow)
        .select("id")
        .single();

      if (createError || !created?.id) {
        return NextResponse.json({ error: createError?.message || "Could not create repeated job." }, { status: 400 });
      }

      createdIds.push(created.id);

      const duplicatedAllocations = ((allocations as any[]) ?? []).map((row: any) => {
        const next = { ...row };
        delete next.id;
        delete next.created_at;
        delete next.updated_at;
        next.job_id = created.id;
        next.start_date = shiftDate(row.start_date ?? job.start_date ?? job.job_date, occurrenceIndex * repeatEveryWeeks * 7);
        next.end_date = shiftDate(row.end_date ?? row.start_date ?? job.end_date ?? job.start_date ?? job.job_date, occurrenceIndex * repeatEveryWeeks * 7);
        next.updated_at = new Date().toISOString();
        return next;
      });

      if (duplicatedAllocations.length > 0) {
        const { error: allocInsertError } = await supabase.from("job_equipment").insert(duplicatedAllocations);
        if (allocInsertError) {
          return NextResponse.json({ error: allocInsertError.message }, { status: 400 });
        }
      }

      const { error: visitError } = await supabase
        .from("job_daily_visit_rates")
        .insert(makeVisitRows({
          jobType: "crane",
          jobId: created.id,
          groupId: group.id,
          occurrenceNumber,
          activeDays,
          dates: occurrence.dates,
        }));

      if (visitError) {
        return NextResponse.json({ error: visitError.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      repeat_group_id: group.id,
      created_count: createdIds.length,
      created_job_ids: createdIds,
      source_included: includeSourceAsWeekOne,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error." }, { status: 500 });
  }
}
