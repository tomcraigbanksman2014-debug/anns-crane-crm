import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function RunSheetsPage({
  searchParams,
}: {
  searchParams?: { date?: string };
}) {
  const selectedDate = searchParams?.date || todayIso();
  const supabase = createSupabaseServerClient();

  const [{ data: jobs }, { data: transportJobs }] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_date,
        start_time,
        end_time,
        site_name,
        site_address,
        notes,
        status,
        operators:operator_id (
          full_name
        ),
        clients:client_id (
          company_name
        )
      `)
      .eq("job_date", selectedDate)
      .neq("archived", true)
      .order("start_time", { ascending: true }),

    supabase
      .from("transport_jobs")
      .select(`
        id,
        transport_number,
        transport_date,
        collection_time,
        delivery_time,
        collection_address,
        delivery_address,
        load_description,
        notes,
        status,
        operators:operator_id (
          full_name
        ),
        vehicles:vehicle_id (
          name,
          reg_number
        ),
        clients:client_id (
          company_name
        )
      `)
      .eq("transport_date", selectedDate)
      .neq("archived", true)
      .order("collection_time", { ascending: true }),
  ]);

  const craneRows = jobs ?? [];
  const transportRows = transportJobs ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Daily Run Sheets</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Print-friendly daily worksheet view for office, drivers and operators.
              </p>
            </div>

            <form method="GET" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" name="date" defaultValue={selectedDate} style={inputStyle} />
              <button type="submit" style={primaryBtn}>Load date</button>
            </form>
          </div>

          <div style={printHint}>
            Open this page for the date you want, then use your browser print to save as PDF.
          </div>

          <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Crane Jobs • {fmtDate(selectedDate)}</h2>

              {craneRows.length === 0 ? (
                <div style={emptyState}>No crane jobs for this date.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {craneRows.map((job: any) => {
                    const operator = first(job.operators);
                    const client = first(job.clients);

                    return (
                      <div key={job.id} style={sheetCard}>
                        <div style={sheetTitle}>Job #{job.job_number ?? "—"}</div>
                        <div style={sheetGrid}>
                          <Info label="Customer" value={client?.company_name ?? "—"} />
                          <Info label="Operator" value={operator?.full_name ?? "—"} />
                          <Info label="Time" value={`${job.start_time ?? "—"} - ${job.end_time ?? "—"}`} />
                          <Info label="Status" value={job.status ?? "—"} />
                          <Info label="Site" value={job.site_name ?? "—"} />
                          <Info label="Address" value={job.site_address ?? "—"} />
                        </div>
                        <NotesBlock label="Notes" value={job.notes ?? "—"} />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Transport Jobs • {fmtDate(selectedDate)}</h2>

              {transportRows.length === 0 ? (
                <div style={emptyState}>No transport jobs for this date.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {transportRows.map((job: any) => {
                    const operator = first(job.operators);
                    const vehicle = first(job.vehicles);
                    const client = first(job.clients);

                    return (
                      <div key={job.id} style={sheetCard}>
                        <div style={sheetTitle}>{job.transport_number ?? "Transport Job"}</div>
                        <div style={sheetGrid}>
                          <Info label="Customer" value={client?.company_name ?? "—"} />
                          <Info label="Driver" value={operator?.full_name ?? "—"} />
                          <Info
                            label="Vehicle"
                            value={`${vehicle?.name ?? "—"}${vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}`}
                          />
                          <Info label="Time" value={`${job.collection_time ?? "—"} - ${job.delivery_time ?? "—"}`} />
                          <Info label="Pickup" value={job.collection_address ?? "—"} />
                          <Info label="Delivery" value={job.delivery_address ?? "—"} />
                          <Info label="Status" value={job.status ?? "—"} />
                        </div>
                        <NotesBlock label="Load" value={job.load_description ?? "—"} />
                        <NotesBlock label="Notes" value={job.notes ?? "—"} />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoBox}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

function NotesBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={infoLabel}>{label}</div>
      <div style={notesStyle}>{value}</div>
    </div>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const printHint: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 700,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.30)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  fontSize: 22,
};

const emptyState: React.CSSProperties = {
  opacity: 0.7,
  fontWeight: 700,
};

const sheetCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const sheetTitle: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 18,
};

const sheetGrid: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const infoBox: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const infoLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  fontWeight: 900,
};

const infoValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 800,
  whiteSpace: "pre-wrap",
};

const notesStyle: React.CSSProperties = {
  marginTop: 6,
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.68)",
  border: "1px solid rgba(0,0,0,0.06)",
  whiteSpace: "pre-wrap",
  minHeight: 52,
};
