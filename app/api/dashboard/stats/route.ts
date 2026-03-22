import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function num(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function overlapsDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  rangeStart: string,
  rangeEnd: string
) {
  const start = startDate ?? null;
  const end = endDate ?? startDate ?? null;
  if (!start || !end) return false;
  return start <= rangeEnd && end >= rangeStart;
}

function dateIsWithinRange(
  targetDate: string | null | undefined,
  rangeStart: string,
  rangeEnd: string
) {
  if (!targetDate) return false;
  return targetDate >= rangeStart && targetDate <= rangeEnd;
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const today = new Date();
    const todayStr = isoDate(today);

    const weekStartDate = new Date(today);
    const weekDay = weekStartDate.getDay();
    const diff = weekDay === 0 ? -6 : 1 - weekDay;
    weekStartDate.setDate(weekStartDate.getDate() + diff);
    weekStartDate.setHours(0, 0, 0, 0);

    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);

    const weekStart = isoDate(weekStartDate);
    const weekEnd = isoDate(weekEndDate);

    const monthStartDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const monthStart = isoDate(monthStartDate);
    const monthEnd = isoDate(monthEndDate);

    const [
      { data: jobs, error: jobsError },
      { data: transportJobs, error: transportError },
      { data: quotes, error: quotesError },
      { data: cranes, error: cranesError },
      { data: vehicles, error: vehiclesError },
      { data: equipment, error: equipmentError },
      { data: operators, error: operatorsError },
      { data: clients, error: clientsError },
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select(`
          id,
          status,
          archived,
          job_date,
          start_date,
          end_date,
          invoice_status,
          total_invoice,
          amount_paid,
          clients:client_id (
            id,
            company_name
          )
        `),

      supabase
        .from("transport_jobs")
        .select(`
          id,
          status,
          archived,
          transport_date,
          delivery_date,
          invoice_status,
          total_invoice,
          amount_paid,
          clients:client_id (
            id,
            company_name
          )
        `),

      supabase
        .from("quotes")
        .select(`
          id,
          status,
          archived,
          quote_date,
          valid_until,
          amount
        `),

      supabase
        .from("cranes")
        .select("id, status, archived"),

      supabase
        .from("vehicles")
        .select("id, status, archived"),

      supabase
        .from("equipment")
        .select("id, status, archived"),

      supabase
        .from("operators")
        .select("id, status, archived"),

      supabase
        .from("clients")
        .select("id, archived"),
    ]);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 400 });
    }

    if (transportError) {
      return NextResponse.json({ error: transportError.message }, { status: 400 });
    }

    if (quotesError) {
      return NextResponse.json({ error: quotesError.message }, { status: 400 });
    }

    if (cranesError) {
      return NextResponse.json({ error: cranesError.message }, { status: 400 });
    }

    if (vehiclesError) {
      return NextResponse.json({ error: vehiclesError.message }, { status: 400 });
    }

    if (equipmentError) {
      return NextResponse.json({ error: equipmentError.message }, { status: 400 });
    }

    if (operatorsError) {
      return NextResponse.json({ error: operatorsError.message }, { status: 400 });
    }

    if (clientsError) {
      return NextResponse.json({ error: clientsError.message }, { status: 400 });
    }

    const activeJobs = (jobs ?? []).filter((job: any) => !job.archived);
    const activeTransportJobs = (transportJobs ?? []).filter((job: any) => !job.archived);
    const activeQuotes = (quotes ?? []).filter((quote: any) => !quote.archived);

    const jobsToday = activeJobs.filter((job: any) =>
      overlapsDateRange(job.start_date ?? job.job_date, job.end_date ?? job.job_date, todayStr, todayStr)
    );

    const jobsThisWeek = activeJobs.filter((job: any) =>
      overlapsDateRange(job.start_date ?? job.job_date, job.end_date ?? job.job_date, weekStart, weekEnd)
    );

    const jobsThisMonth = activeJobs.filter((job: any) =>
      overlapsDateRange(job.start_date ?? job.job_date, job.end_date ?? job.job_date, monthStart, monthEnd)
    );

    const liveJobs = activeJobs.filter((job: any) => String(job.status ?? "").toLowerCase() === "in_progress");

    const confirmedJobs = activeJobs.filter((job: any) => String(job.status ?? "").toLowerCase() === "confirmed");

    const draftJobs = activeJobs.filter((job: any) => String(job.status ?? "").toLowerCase() === "draft");

    const completedJobsThisMonth = activeJobs.filter(
      (job: any) =>
        String(job.status ?? "").toLowerCase() === "completed" &&
        overlapsDateRange(job.start_date ?? job.job_date, job.end_date ?? job.job_date, monthStart, monthEnd)
    );

    const transportToday = activeTransportJobs.filter((job: any) =>
      overlapsDateRange(job.transport_date, job.delivery_date ?? job.transport_date, todayStr, todayStr)
    );

    const transportThisWeek = activeTransportJobs.filter((job: any) =>
      overlapsDateRange(job.transport_date, job.delivery_date ?? job.transport_date, weekStart, weekEnd)
    );

    const transportThisMonth = activeTransportJobs.filter((job: any) =>
      overlapsDateRange(job.transport_date, job.delivery_date ?? job.transport_date, monthStart, monthEnd)
    );

    const liveTransport = activeTransportJobs.filter(
      (job: any) => String(job.status ?? "").toLowerCase() === "in_progress"
    );

    const activeQuotesCount = activeQuotes.filter(
      (quote: any) =>
        String(quote.status ?? "").toLowerCase() !== "accepted" &&
        String(quote.status ?? "").toLowerCase() !== "rejected"
    ).length;

    const acceptedQuotesThisMonth = activeQuotes.filter(
      (quote: any) =>
        String(quote.status ?? "").toLowerCase() === "accepted" &&
        dateIsWithinRange(quote.quote_date, monthStart, monthEnd)
    );

    const quotePipelineValue = activeQuotes.reduce((sum: number, quote: any) => {
      const status = String(quote.status ?? "").toLowerCase();
      if (status === "accepted" || status === "rejected") return sum;
      return sum + num(quote.amount);
    }, 0);

    const quoteWonValueThisMonth = acceptedQuotesThisMonth.reduce(
      (sum: number, quote: any) => sum + num(quote.amount),
      0
    );

    const craneInvoiceOutstanding = activeJobs.reduce((sum: number, job: any) => {
      const total = num(job.total_invoice);
      const paid = num(job.amount_paid);
      return sum + Math.max(total - paid, 0);
    }, 0);

    const transportInvoiceOutstanding = activeTransportJobs.reduce((sum: number, job: any) => {
      const total = num(job.total_invoice);
      const paid = num(job.amount_paid);
      return sum + Math.max(total - paid, 0);
    }, 0);

    const outstandingInvoicesTotal = craneInvoiceOutstanding + transportInvoiceOutstanding;

    const dueForInvoicingJobs = activeJobs.filter((job: any) => {
      const status = String(job.status ?? "").toLowerCase();
      const invoiceStatus = String(job.invoice_status ?? "Not Invoiced").toLowerCase();
      return status === "completed" && invoiceStatus === "not invoiced";
    }).length;

    const dueForInvoicingTransport = activeTransportJobs.filter((job: any) => {
      const status = String(job.status ?? "").toLowerCase();
      const invoiceStatus = String(job.invoice_status ?? "Not Invoiced").toLowerCase();
      return status === "completed" && invoiceStatus === "not invoiced";
    }).length;

    const activeCranes = (cranes ?? []).filter((item: any) => !item.archived).length;
    const activeVehicles = (vehicles ?? []).filter((item: any) => !item.archived).length;
    const activeEquipment = (equipment ?? []).filter((item: any) => !item.archived).length;
    const activeOperators = (operators ?? []).filter((item: any) => !item.archived).length;
    const activeCustomers = (clients ?? []).filter((item: any) => !item.archived).length;

    const unavailableCranes = (cranes ?? []).filter((item: any) => {
      if (item.archived) return false;
      return String(item.status ?? "").toLowerCase() !== "available";
    }).length;

    const unavailableVehicles = (vehicles ?? []).filter((item: any) => {
      if (item.archived) return false;
      return String(item.status ?? "").toLowerCase() !== "active";
    }).length;

    const inactiveOperators = (operators ?? []).filter((item: any) => {
      if (item.archived) return false;
      return String(item.status ?? "").toLowerCase() !== "active";
    }).length;

    const busiestCustomers = (() => {
      const counts = new Map<string, { company_name: string; count: number }>();

      for (const job of activeJobs) {
        const client = first(job.clients);
        const companyName = String(client?.company_name ?? "").trim();
        if (!companyName) continue;

        const existing = counts.get(companyName) ?? { company_name: companyName, count: 0 };
        existing.count += 1;
        counts.set(companyName, existing);
      }

      for (const job of activeTransportJobs) {
        const client = first(job.clients);
        const companyName = String(client?.company_name ?? "").trim();
        if (!companyName) continue;

        const existing = counts.get(companyName) ?? { company_name: companyName, count: 0 };
        existing.count += 1;
        counts.set(companyName, existing);
      }

      return Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    })();

    return NextResponse.json({
      today: todayStr,
      week_start: weekStart,
      week_end: weekEnd,
      month_start: monthStart,
      month_end: monthEnd,

      jobs_today: jobsToday.length,
      jobs_this_week: jobsThisWeek.length,
      jobs_this_month: jobsThisMonth.length,
      jobs_live: liveJobs.length,
      jobs_confirmed: confirmedJobs.length,
      jobs_draft: draftJobs.length,
      jobs_completed_this_month: completedJobsThisMonth.length,

      transport_today: transportToday.length,
      transport_this_week: transportThisWeek.length,
      transport_this_month: transportThisMonth.length,
      transport_live: liveTransport.length,

      quotes_open: activeQuotesCount,
      quotes_pipeline_value: quotePipelineValue,
      quotes_won_this_month: acceptedQuotesThisMonth.length,
      quotes_won_value_this_month: quoteWonValueThisMonth,

      outstanding_invoices_total: outstandingInvoicesTotal,
      crane_invoice_outstanding: craneInvoiceOutstanding,
      transport_invoice_outstanding: transportInvoiceOutstanding,
      due_for_invoicing_jobs: dueForInvoicingJobs,
      due_for_invoicing_transport: dueForInvoicingTransport,

      active_cranes: activeCranes,
      active_vehicles: activeVehicles,
      active_equipment: activeEquipment,
      active_operators: activeOperators,
      active_customers: activeCustomers,

      unavailable_cranes: unavailableCranes,
      unavailable_vehicles: unavailableVehicles,
      inactive_operators: inactiveOperators,

      busiest_customers: busiestCustomers,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Could not load dashboard stats." },
      { status: 400 }
    );
  }
}
