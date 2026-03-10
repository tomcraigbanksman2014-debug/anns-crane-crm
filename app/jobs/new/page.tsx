import ClientShell from "../../ClientShell";
import JobForm from "./JobForm";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function NewJobPage() {
  const supabase = createSupabaseServerClient();

  const [{ data: customers }, { data: equipment }] = await Promise.all([
    supabase.from("clients").select("id, company_name").order("company_name", { ascending: true }),
    supabase.from("equipment").select("id, name").order("name", { ascending: true }),
  ]);

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>New job</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Create a crane hire job.
            </p>
          </div>

          <a href="/jobs" style={btnStyle}>
            ← Back
          </a>
        </div>

        <div style={{ marginTop: 16 }}>
          <JobForm
            mode="create"
            customers={customers ?? []}
            equipment={equipment ?? []}
          />
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
