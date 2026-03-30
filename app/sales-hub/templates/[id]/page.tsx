import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import TemplateForm from "../new/TemplateForm";

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

export default async function SalesTemplateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: template, error } = await supabase
    .from("sales_templates")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !template) {
    return (
      <ClientShell>
        <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
          <div style={errorCard}>{error?.message || "Template not found."}</div>
        </div>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{template.name ?? "Template"}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Edit and maintain reusable outreach settings.
            </p>
          </div>

          <a href="/sales-hub/templates" style={secondaryBtn}>
            ← Template Library
          </a>
        </div>

        <div style={layoutGrid}>
          <div style={{ minWidth: 0 }}>
            <TemplateForm mode="edit" template={template as any} />
          </div>

          <section style={sideCard}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Template snapshot</h2>
            <div style={{ display: "grid", gap: 8 }}>
              <Line label="Channel">{template.channel ?? "-"}</Line>
              <Line label="Goal">{template.goal ?? "-"}</Line>
              <Line label="Tone">{template.tone ?? "-"}</Line>
              <Line label="Service focus">{template.service_focus ?? "-"}</Line>
              <Line label="Availability note">{template.availability_note ?? "-"}</Line>
              <Line label="Custom CTA">{template.custom_cta ?? "-"}</Line>
              <Line label="Subject hint">{template.subject_hint ?? "-"}</Line>
              <Line label="Active">{template.is_active ? "Yes" : "No"}</Line>
              <Line label="Created by">{template.created_by_username ?? "-"}</Line>
              <Line label="Created">{fmtDateTime(template.created_at)}</Line>
              <Line label="Updated">{fmtDateTime(template.updated_at)}</Line>
            </div>
          </section>
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
