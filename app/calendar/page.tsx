import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

type EquipmentRow = {
  id: string;
  name: string | null;
  asset_number: string | null;
  capacity: string | null;
  status: string | null;
};

type BookingRow = {
  id: string;
  equipment_id: string | null;
  client_id: string | null;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  status: string | null;
  clients:
    | { id: string; company_name: string | null; contact_name: string | null }
    | { id: string; company_name: string | null; contact_name: string | null }[]
    | null;
  equipment:
    | { id: string; name: string | null; asset_number: string | null; capacity: string | null }
    | { id: string; name: string | null; asset_number: string | null; capacity: string | null }[]
    | null;
};

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseWeekParam(weekParam?: string | null) {
  if (!weekParam) return null;
  const s = weekParam.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function startOfWeek(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 Sun ... 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + mondayOffset);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function formatDayLabel(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function overlapsDay(booking: BookingRow, day: Date) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

  const start = booking.start_at
    ? new Date(booking.start_at)
    : booking.start_date
    ? new Date(booking.start_date + "T00:00:00")
    : null;

  const end = booking.end_at
    ? new Date(booking.end_at)
    : booking.end_date
    ? new Date(booking.end_date + "T23:59:59")
    : null;

  if (!start || !end) return false;

  return start <= dayEnd && end >= dayStart;
}

function timeLabel(booking: BookingRow, day: Date) {
  if (!booking.start_at || !booking.end_at) return "All day";

  const start = new Date(booking.start_at);
  const end = new Date(booking.end_at);

  const sameDayAsStart =
    start.getFullYear() === day.getFullYear() &&
    start.getMonth() === day.getMonth() &&
    start.getDate() === day.getDate();

  const sameDayAsEnd =
    end.getFullYear() === day.getFullYear() &&
    end.getMonth() === day.getMonth() &&
    end.getDate() === day.getDate();

  const startText = sameDayAsStart
    ? start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "00:00";

  const endText = sameDayAsEnd
    ? end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "23:59";

  return `${startText}–${endText}`;
}

function statusColors(status: string | null): React.CSSProperties {
  const s = (status ?? "").toLowerCase();

  if (s === "confirmed") {
    return {
      background: "rgba(0,180,120,0.18)",
      border: "1px solid rgba(0,180,120,0.30)",
    };
  }

  if (s === "provisional") {
    return {
      background: "rgba(255,170,0,0.18)",
      border: "1px solid rgba(255,170,0,0.30)",
    };
  }

  if (s === "inquiry") {
    return {
      background: "rgba(0,120,255,0.14)",
      border: "1px solid rgba(0,120,255,0.25)",
    };
  }

  if (s === "completed") {
    return {
      background: "rgba(120,120,120,0.18)",
      border: "1px solid rgba(120,120,120,0.28)",
    };
  }

  if (s === "cancelled") {
    return {
      background: "rgba(255,0,0,0.12)",
      border: "1px solid rgba(255,0,0,0.22)",
    };
  }

  return {
    background: "rgba(255,255,255,0.38)",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  const supabase = createSupabaseServerClient();

  const now = new Date();
  const parsed = parseWeekParam(searchParams?.week ?? null);
  const weekStart = startOfWeek(parsed ?? now);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEndExclusive = addDays(weekStart, 7);

  const [{ data: equipmentData, error: equipmentError }, { data: bookingData, error: bookingError }] =
    await Promise.all([
      supabase
        .from("equipment")
        .select("id, name, asset_number, capacity, status")
        .order("name", { ascending: true }),

      supabase
        .from("bookings")
        .select(`
          id,
          equipment_id,
          client_id,
          start_at,
          end_at,
          start_date,
          end_date,
          location,
          status,
          clients:client_id (
            id,
            company_name,
            contact_name
          ),
          equipment:equipment_id (
            id,
            name,
            asset_number,
            capacity
          )
        `)
        .or(
          `and(start_at.lt.${weekEndExclusive.toISOString()},end_at.gte.${weekStart.toISOString()}),and(start_date.lte.${ymd(addDays(weekEndExclusive, -1))},end_date.gte.${ymd(weekStart)})`
        )
        .order("start_at", { ascending: true }),
    ]);

  const equipment = (equipmentData ?? []) as EquipmentRow[];
  const bookings = (bookingData ?? []) as BookingRow[];

  const prevWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);

  return (
    <ClientShell>
      <div style={{ width: "min(1400px, 96vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Weekly Dispatch Board</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Weekly planner by crane/equipment with timed jobs.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <a
              href={`/calendar?week=${ymd(prevWeek)}`}
              style={btnStyle}
            >
              ← Prev week
            </a>

            <div style={{ fontWeight: 900, fontSize: 16 }}>
              {weekDays[0].toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}{" "}
              →{" "}
              {weekDays[6].toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </div>

            <a
              href={`/calendar?week=${ymd(nextWeek)}`}
              style={btnStyle}
            >
              Next week →
            </a>

            <a href="/bookings/new" style={{ ...btnStyle, fontWeight: 900 }}>
              + New booking
            </a>
          </div>
        </div>

        <div style={legendWrap}>
          <span style={{ ...legendItem, ...statusColors("Confirmed") }}>Confirmed</span>
          <span style={{ ...legendItem, ...statusColors("Provisional") }}>Provisional</span>
          <span style={{ ...legendItem, ...statusColors("Inquiry") }}>Inquiry</span>
          <span style={{ ...legendItem, ...statusColors("Completed") }}>Completed</span>
          <span style={{ ...legendItem, ...statusColors("Cancelled") }}>Cancelled</span>
        </div>

        <div style={boardStyle}>
          {(equipmentError || bookingError) && (
            <div style={errorStyle}>
              {equipmentError?.message || bookingError?.message}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "220px repeat(7, minmax(0, 1fr))",
              gap: 10,
              alignItems: "stretch",
            }}
          >
            <div />
            {weekDays.map((day) => (
              <div key={ymd(day)} style={dayHeaderStyle}>
                {formatDayLabel(day)}
              </div>
            ))}

            {equipment.map((eq) => {
              const rowBookings = bookings.filter((b) => b.equipment_id === eq.id);

              return (
                <>
                  <div key={`eq-${eq.id}`} style={equipmentCellStyle}>
                    <div style={{ fontWeight: 900 }}>{eq.name ?? "Unnamed"}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      {eq.asset_number ?? "—"}
                      {eq.capacity ? ` • ${eq.capacity}` : ""}
                    </div>
                  </div>

                  {weekDays.map((day) => {
                    const items = rowBookings.filter((b) => overlapsDay(b, day));

                    return (
                      <div key={`${eq.id}-${ymd(day)}`} style={dayCellStyle}>
                        {items.length === 0 ? (
                          <div style={{ fontSize: 12, opacity: 0.35 }}>Available</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {items.map((b) => {
                              const client = first(b.clients);
                              const styleTone = statusColors(b.status);

                              return (
                                <a
                                  key={b.id}
                                  href={`/bookings/${b.id}`}
                                  style={{
                                    ...bookingCardStyle,
                                    ...styleTone,
                                  }}
                                  title={`${client?.company_name ?? "Customer"} • ${b.location ?? "-"} • ${b.status ?? "-"}`}
                                >
                                  <div style={{ fontSize: 11, fontWeight: 1000 }}>
                                    {timeLabel(b, day)}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 4,
                                      fontSize: 12,
                                      fontWeight: 900,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {client?.company_name ?? "Customer"}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 2,
                                      fontSize: 11,
                                      opacity: 0.82,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {b.location ?? "No location"}
                                  </div>
                                  <div style={{ marginTop: 2, fontSize: 11, opacity: 0.75 }}>
                                    {b.status ?? "—"}
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <a
            href="/dashboard"
            style={{ textDecoration: "none", fontWeight: 900, color: "#111" }}
          >
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

const boardStyle: React.CSSProperties = {
  marginTop: 14,
  background: "rgba(255,255,255,0.18)",
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  overflowX: "auto",
};

const dayHeaderStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.40)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
  fontWeight: 900,
};

const equipmentCellStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.10)",
  minHeight: 92,
};

const dayCellStyle: React.CSSProperties = {
  padding: "8px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(0,0,0,0.08)",
  minHeight: 92,
};

const bookingCardStyle: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  borderRadius: 10,
  padding: "8px 8px",
};

const legendWrap: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const legendItem: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
};

const errorStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
