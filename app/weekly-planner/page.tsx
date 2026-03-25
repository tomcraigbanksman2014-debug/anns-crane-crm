import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

type CraneJob = {
  id: string;
  job_number: number | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  job_date: string | null;
  start_time: string | null;
  end_time: string | null;
  site_name: string | null;
  site_address: string | null;
  notes: string | null;
  exclude_weekends: boolean | null;
  price_mode: string | null;
  price_per_day: number | null;
  invoice_subtotal: number | null;
  invoice_amount: number | null;
  total_invoice: number | null;
  client: { company_name: string | null } | { company_name: string | null }[] | null;
  job_equipment:
    | {
        id: string;
        asset_type: string | null;
        item_name: string | null;
        operator_id: string | null;
        crane: { name: string | null; reg_number: string | null } | { name: string | null; reg_number: string | null }[] | null;
        vehicle: { name: string | null; reg_number: string | null } | { name: string | null; reg_number: string | null }[] | null;
        equipment: { name: string | null; asset_number: string | null } | { name: string | null; asset_number: string | null }[] | null;
        operator: { full_name: string | null } | { full_name: string | null }[] | null;
      }[]
    | null;
};

type TransportJob = {
  id: string;
  transport_number: string | null;
  status: string | null;
  transport_date: string | null;
  delivery_date: string | null;
  collection_time: string | null;
  delivery_time: string | null;
  collection_address: string | null;
  delivery_address: string | null;
  load_description: string | null;
  notes: string | null;
  price_mode: string | null;
  price_per_day: number | null;
  price: number | null;
  agreed_sell_rate: number | null;
  total_invoice: number | null;
  client: { company_name: string | null } | { company_name: string | null }[] | null;
  vehicle: { name: string | null; reg_number: string | null } | { name: string | null; reg_number: string | null }[] | null;
  operator: { full_name: string | null } | { full_name: string | null }[] | null;
};

type WeeklyItem = {
  id: string;
  href: string;
  kind: "crane" | "transport" | "labour";
  title: string;
  subtitle: string;
  rightText: string;
  sortTime: string;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function startOfWeek(dateStr?: string | null) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function activeWorkingDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  excludeWeekends: boolean
) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? startDate ?? "").trim();
  if (!start || !end) return [];

  const startObj = parseDateOnly(start);
  const endObj = parseDateOnly(end);
  if (!startObj || !endObj || endObj < startObj) return [];

  const out: string[] = [];
  const cursor = new Date(startObj);

  while (cursor <= endObj) {
    if (!excludeWeekends || !isWeekend(cursor)) {
      out.push(isoDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function countBillableDays(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  excludeWeekends: boolean
) {
  return activeWorkingDates(startDate, endDate, excludeWeekends).length;
}

function effectiveCraneJobValue(job: CraneJob) {
  const mode = String(job.price_mode ?? "full_job").toLowerCase();
  const start = job.start_date ?? job.job_date;
  const end = job.end_date ?? job.start_date ?? job.job_date;
  const excludeWeekends = Boolean(job.exclude_weekends);

  if (mode === "per_day") {
    return (Number(job.price_per_day ?? 0) || 0) * Math.max(countBillableDays(start, end, excludeWeekends), 1);
  }

  return Number(job.invoice_subtotal ?? job.invoice_amount ?? job.total_invoice ?? 0) || 0;
}

function effectiveTransportValue(job: TransportJob) {
  const mode = String(job.price_mode ?? "full_job").toLowerCase();
  const start = job.transport_date;
  const end = job.delivery_date ?? job.transport_date;

  if (mode === "per_day") {
    const days = countBillableDays(start, end, false);
    return (Number(job.price_per_day ?? 0) || 0) * Math.max(days, 1);
  }

  return Number(job.agreed_sell_rate ?? job.price ?? job.total_invoice ?? 0) || 0;
}

function money(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0";
  return `£${n.toFixed(0)}`;
}

function bankHolidaysByYear(year: number) {
  const map: Record<number, Array<{ date: string; label: string }>> = {
    2025: [
      { date: "2025-01-01", label: "New Year’s Day" },
      { date: "2025-04-18", label: "Good Friday" },
      { date: "2025-04-21", label: "Easter Monday" },
      { date: "2025-05-05", label: "Early May bank holiday" },
      { date: "2025-05-26", label: "Spring bank holiday" },
      { date: "2025-08-25", label: "Summer bank holiday" },
      { date: "2025-12-25", label: "Christmas Day" },
      { date: "2025-12-26", label: "Boxing Day" },
    ],
    2026: [
      { date: "2026-01-01", label: "New Year’s Day" },
      { date: "2026-04-03", label: "Good Friday" },
      { date: "2026-04-06", label: "Easter Monday" },
      { date: "2026-05-04", label: "Early May bank holiday" },
      { date: "2026-05-25", label: "Spring bank holiday" },
      { date: "2026-08-31", label: "Summer bank holiday" },
      { date: "2026-12-25", label: "Christmas Day" },
      { date: "2026-12-28", label: "Boxing Day (substitute day)" },
    ],
    2027: [
      { date: "2027-01-01", label: "New Year’s Day" },
      { date: "2027-03-26", label: "Good Friday" },
      { date: "2027-03-29", label: "Easter Monday" },
      { date: "2027-05-03", label: "Early May bank holiday" },
      { date: "2027-05-31", label: "Spring bank holiday" },
      { date: "2027-08-30", label: "Summer bank holiday" },
      { date: "2027-12-27", label: "Christmas Day (substitute day)" },
      { date: "2027-12-28", label: "Boxing Day (substitute day)" },
    ],
  };

  return map[year] ?? [];
}

function typeBarColor(kind: "crane" | "transport" | "labour") {
  if (kind === "crane") return "#0b57d0";
  if (kind === "transport") return "#0b7a4b";
  return "#7d3c98";
}

export default async function WeeklyPlannerPage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  const supabase = createSupabaseServerClient();

  const weekStart = startOfWeek(searchParams?.week ?? null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekStartIso = isoDate(days[0]);
  const weekEndIso = isoDate(days[6]);
  const prevWeek = isoDate(addDays(weekStart, -7));
  const nextWeek = isoDate(addDays(weekStart, 7));
  const thisWeek = isoDate(startOfWeek());

  const bankHolidays = bankHolidaysByYear(weekStart.getFullYear());

  const [{ data: craneJobs, error: craneError }, { data: transportJobs, error: transportError }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(`
          id,
          job_number,
          status,
          start_date,
          end_date,
          job_date,
          start_time,
          end_time,
          site_name,
          site_address,
          notes,
          exclude_weekends,
          price_mode,
          price_per_day,
          invoice_subtotal,
          invoice_amount,
          total_invoice,
          client:client_id (
            company_name
          ),
          job_equipment (
            id,
            asset_type,
            item_name,
            operator_id,
            crane:crane_id (
              name,
              reg_number
            ),
            vehicle:vehicle_id (
              name,
              reg_number
            ),
            equipment:equipment_id (
              name,
              asset_number
            ),
            operator:operator_id (
              full_name
            )
          )
        `)
        .neq("status", "cancelled"),

      supabase
        .from("transport_jobs")
        .select(`
          id,
          transport_number,
          status,
          transport_date,
          delivery_date,
          collection_time,
          delivery_time,
          collection_address,
          delivery_address,
          load_description,
          notes,
          price_mode,
          price_per_day,
          price,
          agreed_sell_rate,
          total_invoice,
          client:client_id (
            company_name
          ),
          vehicle:vehicle_id (
            name,
            reg_number
          ),
          operator:operator_id (
            full_name
          )
        `)
        .neq("status", "cancelled"),
    ]);

  if (craneError) {
    return (
      <ClientShell>
        <div style={{ width: "min(1800px, 99vw)", margin: "0 auto" }}>
          <div style={errorBox}>{craneError.message}</div>
        </div>
      </ClientShell>
    );
  }

  if (transportError) {
    return (
      <ClientShell>
        <div style={{ width: "min(1800px, 99vw)", margin: "0 auto" }}>
          <div style={errorBox}>{transportError.message}</div>
        </div>
      </ClientShell>
    );
  }

  const craneRows = ((craneJobs ?? []) as CraneJob[]).filter((job) => {
    const start = job.start_date ?? job.job_date;
    const end = job.end_date ?? job.start_date ?? job.job_date;
    const dates = activeWorkingDates(start, end, Boolean(job.exclude_weekends));
    return dates.some((d) => d >= weekStartIso && d <= weekEndIso);
  });

  const transportRows = ((transportJobs ?? []) as TransportJob[]).filter((job) => {
    const dates = activeWorkingDates(job.transport_date, job.delivery_date ?? job.transport_date, false);
    return dates.some((d) => d >= weekStartIso && d <= weekEndIso);
  });

  const itemsByDay: Record<string, WeeklyItem[]> = Object.fromEntries(
    days.map((day) => [isoDate(day), [] as WeeklyItem[]])
  );

  for (const job of craneRows) {
    const clientName = first(job.client)?.company_name ?? "No customer";
    const workingDates = activeWorkingDates(
      job.start_date ?? job.job_date,
      job.end_date ?? job.start_date ?? job.job_date,
      Boolean(job.exclude_weekends)
    ).filter((d) => d >= weekStartIso && d <= weekEndIso);

    const allocations = Array.isArray(job.job_equipment) ? job.job_equipment : [];
    const craneAssets = allocations
      .filter((row) => String(row.asset_type ?? "").toLowerCase() === "crane")
      .map((row) => {
        const crane = first(row.crane);
        return crane?.name ? crane.name : row.item_name || "Unassigned crane";
      });

    const labourRows = allocations.filter(
      (row) => String(row.asset_type ?? "").toLowerCase() === "other"
    );

    for (const d of workingDates) {
      itemsByDay[d].push({
        id: `crane-${job.id}-${d}`,
        href: `/jobs/${job.id}`,
        kind: "crane",
        title: `#${job.job_number ?? ""} ${clientName}`.trim(),
        subtitle: `${craneAssets.length > 0 ? craneAssets.join(", ") : "Unassigned crane"} • ${job.site_name || "No site"}`,
        rightText: `${job.start_time ?? "—"}-${job.end_time ?? "—"} • ${money(effectiveCraneJobValue(job))}`,
        sortTime: job.start_time ?? "99:99",
      });
    }

    for (const labour of labourRows) {
      const operatorName = first(labour.operator)?.full_name ?? "Unassigned";
      const labourDates = activeWorkingDates(
        job.start_date ?? job.job_date,
        job.end_date ?? job.start_date ?? job.job_date,
        Boolean(job.exclude_weekends)
      ).filter((d) => d >= weekStartIso && d <= weekEndIso);

      for (const d of labourDates) {
        itemsByDay[d].push({
          id: `labour-${labour.id}-${d}`,
          href: `/jobs/${job.id}`,
          kind: "labour",
          title: `${labour.item_name || "Labour"} ${clientName}`.trim(),
          subtitle: `${operatorName} • ${job.site_name || "No site"}`,
          rightText: `${job.start_time ?? "—"}-${job.end_time ?? "—"}`,
          sortTime: job.start_time ?? "99:99",
        });
      }
    }
  }

  for (const job of transportRows) {
    const clientName = first(job.client)?.company_name ?? "No customer";
    const vehicle = first(job.vehicle);
    const operator = first(job.operator);
    const dates = activeWorkingDates(job.transport_date, job.delivery_date ?? job.transport_date, false).filter(
      (d) => d >= weekStartIso && d <= weekEndIso
    );

    for (const d of dates) {
      itemsByDay[d].push({
        id: `transport-${job.id}-${d}`,
        href: `/transport-jobs/${job.id}`,
        kind: "transport",
        title: `${job.transport_number || "Transport"} ${clientName}`.trim(),
        subtitle: `${vehicle?.name || "Unassigned vehicle"}${operator?.full_name ? ` • ${operator.full_name}` : ""}`,
        rightText: `${job.collection_time ?? "—"}-${job.delivery_time ?? "—"} • ${money(effectiveTransportValue(job))}`,
        sortTime: job.collection_time ?? "99:99",
      });
    }
  }

  for (const key of Object.keys(itemsByDay)) {
    itemsByDay[key].sort((a, b) => {
      if (a.sortTime !== b.sortTime) return a.sortTime.localeCompare(b.sortTime);
      return a.title.localeCompare(b.title);
    });
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1800px, 99vw)", margin: "0 auto" }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Weekly Planner</h1>
            <p style={{ marginTop: 4, opacity: 0.78 }}>
              Clean weekly board for crane, transport and labour work.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={`/weekly-planner?week=${prevWeek}`} style={secondaryBtn}>← Prev</a>
            <a href={`/weekly-planner?week=${thisWeek}`} style={secondaryBtn}>This week</a>
            <a href={`/weekly-planner?week=${nextWeek}`} style={secondaryBtn}>Next →</a>
          </div>
        </div>

        <div style={summaryBar}>
          <div style={summaryItem}>Week: {weekStartIso}</div>
          <div style={summaryItem}>Crane jobs: {craneRows.length}</div>
          <div style={summaryItem}>Transport jobs: {transportRows.length}</div>
          <div style={summaryItem}>
            Labour rows: {craneRows.reduce((sum, job) => sum + (job.job_equipment?.filter((r) => String(r.asset_type ?? "").toLowerCase() === "other").length ?? 0), 0)}
          </div>
        </div>

        <div style={scrollWrap}>
          <div style={weekGrid}>
            {days.map((day) => {
              const dayIso = isoDate(day);
              const holiday = bankHolidays.find((h) => h.date === dayIso);
              const items = itemsByDay[dayIso] ?? [];

              return (
                <section key={dayIso} style={dayColumn}>
                  <div
                    style={{
                      ...dayHeader,
                      ...(holiday
                        ? {
                            background: "rgba(255,170,0,0.12)",
                            border: "1px solid rgba(255,170,0,0.20)",
                          }
                        : {}),
                    }}
                  >
                    <div style={{ fontWeight: 1000, fontSize: 15 }}>{formatDay(day)}</div>
                    <div style={{ fontSize: 11, opacity: 0.72 }}>{items.length}</div>
                  </div>

                  <div style={{ fontSize: 11, opacity: 0.68, padding: "0 2px" }}>
                    {dayIso}
                    {holiday ? ` • ${holiday.label}` : ""}
                  </div>

                  <div style={itemsWrap}>
                    {items.length === 0 ? (
                      <div style={emptyBox}>No work</div>
                    ) : (
                      items.map((item) => (
                        <a key={item.id} href={item.href} style={rowLink}>
                          <div style={{ ...typeBar, background: typeBarColor(item.kind) }} />
                          <div style={rowBody}>
                            <div style={rowTop}>
                              <div style={rowTitle}>{item.title}</div>
                              <div style={rowRight}>{item.rightText}</div>
                            </div>
                            <div style={rowSub}>{item.subtitle}</div>
                          </div>
                        </a>
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const summaryBar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

const summaryItem: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
  fontSize: 13,
};

const scrollWrap: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  paddingBottom: 6,
};

const weekGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(240px, 1fr))",
  gap: 8,
  alignItems: "start",
  minWidth: 1700,
};

const dayColumn: React.CSSProperties = {
  minHeight: 520,
  display: "grid",
  gap: 8,
  alignContent: "start",
};

const dayHeader: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const itemsWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const emptyBox: React.CSSProperties = {
  padding: "10px 8px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.58)",
  border: "1px dashed rgba(0,0,0,0.10)",
  opacity: 0.72,
  fontSize: 12,
};

const rowLink: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "4px minmax(0, 1fr)",
  textDecoration: "none",
  color: "#111",
  background: "rgba(255,255,255,0.86)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 8,
  overflow: "hidden",
};

const typeBar: React.CSSProperties = {
  width: 4,
};

const rowBody: React.CSSProperties = {
  padding: "7px 8px",
  minWidth: 0,
};

const rowTop: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 6,
  alignItems: "start",
};

const rowTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const rowRight: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
  opacity: 0.82,
};

const rowSub: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  opacity: 0.78,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 8,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  fontSize: 13,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
