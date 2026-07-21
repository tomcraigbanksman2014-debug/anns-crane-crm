import ClientShell from "../../ClientShell";
import OperatorQualificationInlineSummary from "../../components/OperatorQualificationInlineSummary";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "active") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (s === "inactive") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  return {
    background: "rgba(255,255,255,0.35)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

function Row({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value || "—"}</div>
    </div>
  );
}

function Block({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          background: "rgba(255,255,255,0.42)",
          border: "1px solid rgba(0,0,0,0.08)",
          whiteSpace: "pre-wrap",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

export default async function OperatorDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: operator, error } = await supabase
    .from("operators")
    .select("*")
    .eq("id", params.id)
    .single();

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>
                {operator?.full_name ?? "Operator"}
              </h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                View operator details and qualification compliance.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/operators" style={secondaryBtn}>
                ← Back to operators
              </a>
              {operator?.id ? (
                <>
                  <a href={`/operators/${operator.id}/edit`} style={secondaryBtn}>
                    Edit operator
                  </a>
                  <a href={`/operators/${operator.id}/qualifications`} style={secondaryBtn}>
                    Qualifications
                  </a>
                </>
              ) : null}
            </div>
          </div>

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : !operator ? (
            <div style={errorBox}>Operator not found.</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              <section style={sectionCard}>
                <h2 style={sectionTitle}>Operator details</h2>

                <Row label="Full name" value={operator.full_name} />
                <Row label="Email" value={operator.email} />
                <Row label="Phone" value={operator.phone} />
                <Row label="Role" value={operator.role} />
                <Row
                  label="Status"
                  value={
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 900,
                        ...statusStyle(operator.status),
                      }}
                    >
                      {operator.status || "—"}
                    </span>
                  }
                />
                <Row label="Archived" value={operator.archived ? "Yes" : "No"} />
                <Row label="Created" value={fmtDateTime(operator.created_at)} />
                <Row label="Updated" value={fmtDateTime(operator.updated_at)} />
                <Block label="Notes" value={operator.notes} />
              </section>

              <OperatorQualificationInlineSummary operatorId={params.id} />
            </div>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
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

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.24)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
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
