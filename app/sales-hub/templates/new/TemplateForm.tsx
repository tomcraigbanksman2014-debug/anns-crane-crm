import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import TemplateForm from "./new/TemplateForm";

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

export default async function SalesTemplatesPage() {
  const supabase = createSupabaseServerClient();

  const { data: templates, error } = await supabase
    .from("sales_templates")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Template Library</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Save outreach setups you can reuse across leads and campaigns.
            </p>
          </div>

          <a href="/sales-hub" style={secondaryBtn}>
            ← Sales Hub
          </a>
        </div>

        <div style={layoutGrid}>
          <div style={{ minWidth: 0 }}>
            <TemplateForm mode="create" />
          </div>

          <section style={sideCard}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Saved templates</h2>

            {error ? <div style={errorBox}>{error.message}</div> : null}

            {!templates || templates.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.75 }}>No templates yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {templates.map((template: any) => (
                  <a key={template.id} href={`/sales-hub/templates/${template.id}`} style={itemCard}>
                    <div style={{ fontWeight: 900 }}>{template.name ?? "Template"}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      {template.channel ?? "email"} • {template.goal ?? "introduction"} • {template.tone ?? "professional"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      {template.is_active ? "Active" : "Inactive"} • Updated {fmtDateTime(template.updated_at)}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </ClientShell>
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

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
  gap: 16,
  alignItems: "start",
};

const sideCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const itemCard: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
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

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};
