import ClientShell from "../../../../ClientShell";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import OutreachGenerator from "./OutreachGenerator";

export default async function LeadOutreachPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: lead, error } = await supabase
    .from("sales_leads")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !lead) {
    return (
      <ClientShell>
        <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
          <div style={errorCard}>{error?.message || "Lead not found."}</div>
        </div>
      </ClientShell>
    );
  }

  const services = Array.isArray((lead as any).services) ? ((lead as any).services as string[]) : [];
  const defaultService = services[0] ?? "";

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Outreach Generator</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Create review-ready messages for {(lead as any).company_name ?? "this lead"}.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/sales-hub/leads/${params.id}`} style={secondaryBtn}>
              ← Back to lead
            </a>
          </div>
        </div>

        <div style={gridStyle}>
          <section style={summaryCard}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Lead snapshot</h2>
            <div style={{ display: "grid", gap: 8 }}>
              <Line label="Company">{(lead as any).company_name || "-"}</Line>
              <Line label="Contact">{(lead as any).contact_name || "-"}</Line>
              <Line label="Email">{(lead as any).email || "-"}</Line>
              <Line label="Phone">{(lead as any).phone || "-"}</Line>
              <Line label="Area">{(lead as any).area || "-"}</Line>
              <Line label="Industry">{(lead as any).industry || "-"}</Line>
              <Line label="Status">{(lead as any).status || "-"}</Line>
              <Line label="Services">
                {services.length ? services.join(", ") : "-"}
              </Line>
              <Line label="Do not contact">
                {(lead as any).do_not_contact ? "Yes" : "No"}
              </Line>
            </div>
          </section>

          <div style={{ minWidth: 0 }}>
            <OutreachGenerator
              leadId={params.id}
              defaultService={defaultService}
              leadCompany={(lead as any).company_name ?? ""}
              doNotContact={Boolean((lead as any).do_not_contact)}
            />
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 3, fontWeight: 600, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)",
  gap: 16,
  alignItems: "start",
};

const summaryCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorCard: React.CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
};
