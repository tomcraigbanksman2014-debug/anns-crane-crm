import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

type BookingRow = {
  id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  location: string | null;
  status: string | null;
  clients: { id: string; company_name: string | null; contact_name: string | null } | null;
  equipment: { id: string; name: string | null; asset_number: string | null; capacity: string | null } | null;
};

// Raw Supabase nested select shape (arrays)
type BookingRowRaw = Omit<BookingRow, "clients" | "equipment"> & {
  clients: { id: string; company_name: string | null; contact_name: string | null }[] | null;
  equipment: { id: string; name: string | null; asset_number: string | null; capacity: string | null }[] | null;
};

function normalizeBooking(b: BookingRowRaw): BookingRow {
  return {
    ...b,
    clients: Array.isArray(b.clients) ? b.clients[0] ?? null : null,
    equipment: Array.isArray(b.equipment) ? b.equipment[0] ?? null : null,
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseMonthParam(monthParam?: string | null) {
  if (!monthParam) return null;
  const m = monthParam.trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mm] = m.split("-").map((x) => Number(x));
  if (!y || !mm || mm < 1 || mm > 12) return null;
  return { y, m: mm };
}

function monthStart(y: number, m: number) {
  return new Date(y, m - 1, 1);
}

function monthEndExclusive(y: number, m: number) {
  return new Date(y, m, 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function startOfCalendarGrid(monthFirst: Date) {
  // Monday-start grid
  const d = new Date(monthFirst);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const mondayIndex = (day + 6) % 7; // Sun->6, Mon->0, Tue->1...
  d.setDate(d.getDate() - mondayIndex);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfCalendarGrid(monthLast: Date) {
  // Extend to Sunday end (Monday-start grid)
  const d = new Date(monthLast);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const toSunday = 6 - ((day + 6) % 7);
  d.setDate(d.getDate() + toSunday);
  d.setHours(0, 0, 0, 0);

  const end = new Date(d);
  end.setDate(end.getDate() + 1);
  return end;
}

function eachDay(start: Date, endExclusive: Date) {
  const days: Date[] = [];
  const d = new Date(start);
  while (d < endExclusive) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function expandBookingDays(b: BookingRow) {
  const start = new Date(b.start_date + "T00:00:00");
  const end = new Date(b.end_date + "T00:00:00");
  const days: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    days.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: { month?: string };
}) {
  const supabase = createSupabaseServerClient();

  const now = new Date();
  const parsed = parseMonthParam(searchParams?.month ?? null);
  const activeMonthDate = parsed
    ? monthStart(parsed.y, parsed.m)
    : monthStart(now.getFullYear(), now.getMonth() + 1);

  const firstDay = monthStart(activeMonthDate.getFullYear(), activeMonthDate.getMonth() + 1);
  const nextMonthFirst = monthEndExclusive(activeMonthDate.getFullYear(), activeMonthDate.getMonth() + 1);

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      start_date,
      end_date,
      location,
      status,
      clients:clients(id, company_name, contact_name),
      equipment:equipment(id, name, asset_number, capacity)
    `
    )
    .lt("start_date", ymd(nextMonthFirst))
    .gte("end_date", ymd(firstDay))
    .order("start_date", { ascending: true });

  const bookings: BookingRow[] = ((data ?? []) as unknown as BookingRowRaw[]).map(normalizeBooking);

  const byDay: Record<string, BookingRow[]> = {};
  for (const b of bookings) {
    for (const day of expandBookingDays(b)) {
      (byDay[day] ||= []).push(b);
    }
  }

  const monthLast = new Date(nextMonthFirst);
  monthLast.setDate(monthLast.getDate() - 1);

  const gridStart = startOfCalendarGrid(firstDay);
  const gridEnd = endOfCalendarGrid(monthLast);
  const days = eachDay(gridStart, gridEnd);

  const prev = addMonths(activeMonthDate, -1);
  const next = addMonths(activeMonthDate, +1);
  const monthLabel = activeMonthDate.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Calendar</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>See bookings by day (month view).</p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <a href={`/calendar?month=${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`} style={btnStyle}>
              ← Prev
            </a>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{monthLabel}</div>
            <a href={`/calendar?month=${next.getFullYear()}-${pad2(next.getMonth() + 1)}`} style={btnStyle}>
              Next →
            </a>

            <a href="/bookings/new" style={{ ...btnStyle, fontWeight: 900 }}>
              + New booking
            </a>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            background: "rgba(255,255,255,0.18)",
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.4)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          }}
        >
          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,0,0,0.10)",
                border: "1px solid rgba(255,0,0,0.25)",
              }}
            >
              {error.message}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 10 }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} style={{ fontSize: 12, opacity: 0.75, fontWeight: 800, padding: "0 6px" }}>
                {d}
              </div>
            ))}

            {days.map((d) => {
              const key = ymd(d);
              const inMonth = d.getMonth() === activeMonthDate.getMonth();
              const items = byDay[key] ?? [];

              return (
                <div
                  key={key}
                  style={{
                    minHeight: 110,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.10)",
                    background: inMonth ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.14)",
                    padding: 10,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <div style={{ fontWeight: 900, opacity: inMonth ? 1 : 0.45 }}>{d.getDate()}</div>
                    {items.length > 0 && <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>{items.length}</div>}
                  </div>

                  {items.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.45 }}>—</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {items.slice(0, 3).map((b) => {
                        const company = b.clients?.company_name ?? "Customer";
                        const equip = b.equipment?.name ?? "Equipment";
                        const status = b.status ?? "—";

                        return (
                          <a
                            key={b.id}
                            href={`/bookings/${b.id}`}
                            style={{
                              textDecoration: "none",
                              color: "#111",
                              borderRadius: 10,
                              border: "1px solid rgba(0,0,0,0.10)",
                              background: "rgba(255,255,255,0.55)",
                              padding: "8px 8px",
                              fontSize: 12,
                              lineHeight: 1.2,
                              fontWeight: 800,
                            }}
                            title={`${company} • ${equip} • ${status}`}
                          >
                            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{company}</div>
                            <div
                              style={{
                                fontWeight: 700,
                                opacity: 0.75,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {equip} • {status}
                            </div>
                          </a>
                        );
                      })}

                      {items.length > 3 && <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>+{items.length - 3} more…</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <a href="/dashboard" style={{ textDecoration: "none", fontWeight: 900, color: "#111" }}>
            ← Back to dashboard
          </a>
        </div>
      </div>
    </ClientShell>
  );
}

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};
