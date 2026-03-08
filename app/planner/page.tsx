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
  start_date: string | null;
  end_date: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  location: string | null;
  clients:
    | {
        company_name: string | null;
      }
    | {
        company_name: string | null;
      }[]
    | null;
};

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetweenInclusive(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const days: string[] = [];
  const d = new Date(s);
  while (d <= e) {
    days.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function overlapsWindow(
  bookingStart: string | null,
  bookingEnd: string | null,
  windowStart: string,
  windowEnd: string
) {
  if (!bookingStart || !bookingEnd) return false;
  return bookingStart <= windowEnd && bookingEnd >= windowStart;
}

function statusColor(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "confirmed") {
    return "rgba(0,180,120,0.22)";
  }
  if (s === "provisional") {
    return "rgba(255,170,0,0.22)";
  }
  if (s === "inquiry") {
    return "rgba(0,120,255,0.16)";
  }
  if (s === "completed") {
    return "rgba(120,120,120,0.18)";
  }
  if (s === "cancelled") {
    return "rgba(255,0,0,0.12)";
  }
  return "rgba(255,255,255,0.35)";
}

export default async function PlannerPage() {
  const supabase = createSupabaseServerClient();

  const today = startOfToday();
  const rangeStart = isoDate(today);
  const rangeEnd = isoDate(addDays(today, 13));
  const headerDays = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  const [
    { data: equipment, error: equipmentError },
    { data: bookings, error: bookingsError },
  ] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, name, asset_number, capacity, status")
      .order("name", { ascending: true }),

    supabase
      .from("bookings")
      .select(`
        id,
        equipment_id,
        start_date,
        end_date,
        start_at,
        end_at,
        status,
        location,
        clients:client_id (
          company_name
        )
      `)
      .lte("start_date", rangeEnd)
      .gte("end_date", rangeStart)
      .neq("status", "Cancelled")
      .order("start_date", { ascending: true }),
  ]);

  const errorMessage = equipmentError?.message || bookingsError?.message || null;

  const equipmentRows = ((equipment ?? []) as EquipmentRow[]) || [];
  const bookingRows = ((bookings ?? []) as BookingRow[]) || [];

  return (
    <ClientShell>
      <div style={{ width: "min(1400px, 98vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Planner</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              14-day equipment scheduling view.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/bookings/new" style={btnStyle}>
              + New booking
            </a>
            <a href="/calendar" style={btnStyle}>
              Calendar
            </a>
          </div>
        </div>

        <div style={panelStyle}>
          {errorMessage ? (
            <div style={errorBox}>{errorMessage}</div>
          ) : equipmentRows.length === 0 ? (
            <p style={{ margin: 0 }}>No equipment found.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 1250 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "260px repeat(14, minmax(70px, 1fr))",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <div style={stickyHeaderCell}>Equipment</div>
                  {headerDays.map((d) => (
                    <div key={d.toISOString()} style={headerCell}>
                      <div style={{ fontWeight: 900 }}>
                        {d.toLocaleDateString("en-GB", { weekday: "short" })}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                        {d.toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {equipmentRows.map((eq) => {
                    const eqBookings = bookingRows.filter(
                      (b) =>
                        b.equipment_id === eq.id &&
                        overlapsWindow(b.start_date, b.end_date, rangeStart, rangeEnd)
                    );

                    return (
                      <div
                        key={eq.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "260px 1fr",
                          gap: 8,
                          alignItems: "stretch",
                        }}
                      >
                        <div style={equipmentCell}>
                          <div style={{ fontWeight: 900 }}>{eq.name ?? "Unnamed"}</div>
                          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                            {eq.asset_number ?? "—"}
                            {eq.capacity ? ` • ${eq.capacity}` : ""}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
                            {eq.status ?? "—"}
                          </div>
                        </div>

                        <div
                          style={{
                            position: "relative",
                            minHeight: 92,
                            borderRadius: 14,
                            border: "1px solid rgba(0,0,0,0.08)",
                            background: "rgba(255,255,255,0.22)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(14, minmax(70px, 1fr))",
                              height: "100%",
                            }}
                          >
                            {headerDays.map((d) => (
                              <div
                                key={d.toISOString()}
                                style={{
                                  borderRight: "1px solid rgba(0,0,0,0.06)",
                                  background:
                                    isoDate(d) === rangeStart
                                      ? "rgba(0,120,255,0.04)"
                                      : "transparent",
                                }}
                              />
                            ))}
                          </div>

                          {eqBookings.map((b) => {
                            const client = first(b.clients);
                            const bStart = b.start_date ?? rangeStart;
                            const bEnd = b.end_date ?? bStart;

                            const allVisibleDays = daysBetweenInclusive(rangeStart, rangeEnd);
                            const startIndex = Math.max(
                              0,
                              allVisibleDays.findIndex((x) => x === bStart)
                            );
                            const endIndexRaw = allVisibleDays.findIndex((x) => x === bEnd);
                            const endIndex =
                              endIndexRaw === -1 ? allVisibleDays.length - 1 : endIndexRaw;

                            const safeStart = bStart < rangeStart ? 0 : startIndex;
                            const safeEnd = bEnd > rangeEnd ? allVisibleDays.length - 1 : endIndex;
                            const span = Math.max(1, safeEnd - safeStart + 1);

                            return (
                              <a
                                key={b.id}
                                href={`/bookings/${b.id}`}
                                title={`${client?.company_name ?? "Customer"} • ${b.location ?? "No location"}`}
                                style={{
                                  position: "absolute",
                                  left: `calc(${(safeStart / 14) * 100}% + 6px)`,
                                  width: `calc(${(span / 14) * 100}% - 12px)`,
                                  top: 12,
                                  height: 68,
                                  borderRadius: 12,
                                  padding: "8px 10px",
                                  textDecoration: "none",
                                  color: "#111",
                                  background: statusColor(b.status),
                                  border: "1px solid rgba(0,0,0,0.10)",
                                  overflow: "hidden",
                                  boxSizing: "border-box",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 900,
                                    fontSize: 13,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {client?.company_name ?? "Customer"}
                                </div>
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 12,
                                    opacity: 0.8,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {b.location ?? "No location"}
                                </div>
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 11,
                                    fontWeight: 800,
                                    opacity: 0.72,
                                  }}
                                >
                                  {b.status ?? "—"}
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a href="/dashboard" style={backLink}>
            ← Dashboard
          </a>
        </div>
      </div>
    </ClientShell>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const stickyHeaderCell: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
};

const headerCell: React.CSSProperties = {
  padding: "10px 8px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  textAlign: "center",
  fontSize: 13,
};

const equipmentCell: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
};

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

const backLink: React.CSSProperties = {
  textDecoration: "none",
  fontWeight: 800,
  color: "#111",
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
