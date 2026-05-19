import type { CSSProperties } from "react";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getCraneDocumentsForManager } from "../../lib/assetDocuments";
import { getAssetAvailabilityForAsset } from "../../lib/assetAvailability";
import AssetAvailabilityManager from "../../components/AssetAvailabilityManager";

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
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: crane, error }, docs, availabilityEntries] = await Promise.all([
    supabase.from("cranes").select("*").eq("id", params.id).single(),
    getCraneDocumentsForManager(params.id),
    getAssetAvailabilityForAsset(supabase, "crane", params.id),
  ]);

  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={pageHeader}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Crane Record</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Service, inspection, LOLER and asset appendix PDFs.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/cranes" style={secondaryBtn}>← Back to cranes</a>
            <a href={`/cranes/${params.id}/edit`} style={primaryBtn}>Edit crane</a>
          </div>
        </div>

        {successMessage ? <div style={successBox}>{successMessage}</div> : null}
        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
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
              <AssetAvailabilityManager
                assetType="crane"
                assetId={crane.id}
                assetName={crane.name ?? crane.reg_number ?? "this crane"}
                initialEntries={availabilityEntries}
              />
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitle}>Notes</h2>
              <div style={notesBox}>{crane.notes ?? "No notes recorded."}</div>
            </section>

            <section style={{ ...cardStyle, gridColumn: "1 / -1" }}>
              <h2 style={sectionTitle}>Asset PDFs</h2>
              {docs.length === 0 ? (
                <div style={emptyBox}>No PDFs uploaded yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {docs.map((doc) => (
                    <div key={doc.id} style={docRow}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{doc.title}</div>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                          {doc.document_type} • {fmtDate(doc.uploaded_at)}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                          Include in pack: {doc.include_in_pack ? "Yes" : "No"} • Appendix order: {doc.appendix_order ?? "—"} • Preview pages: {doc.preview_page_numbers.length ? doc.preview_page_numbers.join(", ") : "—"} • Generated previews: {doc.preview_count}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {doc.open_url ? (
                          <a href={doc.open_url} target="_blank" rel="noreferrer" style={secondaryBtn}>
                            Open PDF
                          </a>
                        ) : null}
                        <a href={`/cranes/${params.id}/edit`} style={secondaryBtn}>
                          Manage
                        </a>
                      </div>
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

const pageHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 18,
};

const gridWrap: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 18,
};

const cardStyle: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const rowStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const rowLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.7,
};

const rowValue: CSSProperties = {
  marginTop: 6,
  fontWeight: 800,
};

const notesBox: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const docRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.48)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const emptyBox: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const primaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
};

const secondaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const successBox: CSSProperties = {
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,128,0,0.10)",
  border: "1px solid rgba(0,128,0,0.18)",
};

const errorBox: CSSProperties = {
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
