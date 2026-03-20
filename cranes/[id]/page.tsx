import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={rowStyle}>
      <div style={rowLabel}>{label}</div>
      <div style={rowValue}>{value}</div>
    </div>
  );
}

export default async function CranePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: crane, error }, { data: docs }] = await Promise.all([
    supabase.from("cranes").select("*").eq("id", params.id).single(),
    supabase
      .from("crane_documents")
      .select("*")
      .eq("crane_id", params.id)
      .order("uploaded_at", { ascending: false }),
  ]);

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={pageHeader}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Crane Record</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Service, inspection, LOLER and crane documents.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/cranes" style={secondaryBtn}>← Back to cranes</a>
            <a href={`/cranes/${params.id}/edit`} style={primaryBtn}>Edit crane</a>
          </div>
        </div>

        {error ? <div style={errorBox}>{error.message}</div> : null}
        {!crane ? <div style={errorBox}>Crane not found.</div> : null}

        {crane ? (
          <div style={gridWrap}>
            <section style={cardStyle}>
              <h2 style={sectionTitle}>Core Details</h2>
              <div style={summaryGrid}>
                <Row label="Name" value={crane.name ?? "—"} />
                <Row label="Reg" value={crane.reg_number ?? "—"} />
                <Row label="Fleet" value={crane.fleet_number ?? "—"} />
                <Row label="Make" value={crane.make ?? "—"} />
                <Row label="Model" value={crane.model ?? "—"} />
                <Row label="Capacity" value={crane.capacity ?? "—"} />
                <Row label="Status" value={crane.status ?? "—"} />
              </div>
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitle}>Compliance</h2>
              <div style={summaryGrid}>
                <Row label="Last service" value={fmtDate(crane.last_service_on)} />
                <Row label="Service due" value={fmtDate(crane.service_due_on)} />
                <Row label="Last inspection" value={fmtDate(crane.last_inspection_on)} />
                <Row label="Inspection due" value={fmtDate(crane.inspection_due_on)} />
                <Row label="Last LOLER" value={fmtDate(crane.last_loler_on)} />
                <Row label="LOLER due" value={fmtDate(crane.loler_due_on)} />
                <Row label="Insurance due" value={fmtDate(crane.insurance_due_on)} />
                <Row label="Tax due" value={fmtDate(crane.tax_due_on)} />
                <Row label="MOT due" value={fmtDate(crane.mot_due_on)} />
                <Row label="Registration expires" value={fmtDate(crane.registration_expires_on)} />
              </div>
            </section>

            <section style={{ ...cardStyle, gridColumn: "1 / -1" }}>
              <h2 style={sectionTitle}>Notes</h2>
              <div style={notesBox}>{crane.notes ?? "—"}</div>
            </section>

            <section style={{ ...cardStyle, gridColumn: "1 / -1" }}>
              <h2 style={sectionTitle}>Documents</h2>
              {!docs || docs.length === 0 ? (
                <div style={emptyBox}>No documents uploaded yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {docs.map((doc: any) => (
                    <div key={doc.id} style={docRow}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{doc.title}</div>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                          {doc.document_type} • {fmtDate(doc.uploaded_at)}
                        </div>
                      </div>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        style={secondaryBtn}
                      >
                        Open PDF
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </ClientShell>
  );
}

const pageHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 18,
};

const gridWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 18,
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gap: 2,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const rowLabel: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.72,
  minWidth: 150,
};

const rowValue: React.CSSProperties = {
  fontWeight: 800,
  textAlign: "right",
};

const notesBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const docRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.48)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const emptyBox: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
