import { createSupabaseServerClient } from "../lib/supabase/server";
import {
  getQualificationStatus,
  getQualificationSummary,
} from "../lib/utils/qualificationStatus";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function expiryStyle(kind: "expired" | "expiring" | "valid" | "none"): React.CSSProperties {
  if (kind === "expired") {
    return {
      background: "rgba(255,0,0,0.12)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.22)",
    };
  }

  if (kind === "expiring") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  if (kind === "valid") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  return {
    background: "rgba(255,255,255,0.45)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

export default async function OperatorQualificationInlineSummary({
  operatorId,
}: {
  operatorId: string;
}) {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("operator_qualifications")
    .select("id, qualification_name, issuer, expiry_date")
    .eq("operator_id", operatorId)
    .order("expiry_date", { ascending: true });

  if (error) {
    return <div style={errorBox}>Could not load qualifications: {error.message}</div>;
  }

  const rows = data ?? [];
  const summary = getQualificationSummary(rows);

  return (
    <section style={cardStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>Qualifications</h2>
          <div style={{ opacity: 0.72, fontSize: 13 }}>
            Quick compliance view for this operator.
          </div>
        </div>

        <a href={`/operators/${operatorId}/qualifications`} style={linkBtn}>
          Manage qualifications
        </a>
      </div>

      <div style={summaryWrap}>
        <div style={summaryCard}>
          <div style={summaryLabel}>Total</div>
          <div style={summaryValue}>{summary.total}</div>
        </div>

        <div style={summaryCard}>
          <div style={summaryLabel}>Expiring soon</div>
          <div style={summaryValue}>{summary.expiring}</div>
        </div>

        <div style={summaryCard}>
          <div style={summaryLabel}>Expired</div>
          <div style={summaryValue}>{summary.expired}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={emptyBox}>No qualifications added yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {rows.slice(0, 6).map((row: any) => {
            const kind = getQualificationStatus(row.expiry_date);

            return (
              <div key={row.id} style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 900 }}>
                    {row.qualification_name ?? "Qualification"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                    Issuer: {row.issuer ?? "—"} • Expiry: {fmtDate(row.expiry_date)}
                  </div>
                </div>

                <span
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 900,
                    ...expiryStyle(kind),
                  }}
                >
                  {kind === "expired"
                    ? "Expired"
                    : kind === "expiring"
                      ? "Expiring soon"
                      : kind === "valid"
                        ? "Valid"
                        : "No expiry"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.24)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
};

const linkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 12px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.70)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const summaryWrap: React.CSSProperties = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
};

const summaryCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const summaryLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  fontWeight: 800,
};

const summaryValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 24,
  fontWeight: 1000,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const emptyBox: React.CSSProperties = {
  marginTop: 14,
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
