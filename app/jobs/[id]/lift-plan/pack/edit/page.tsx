import type { CSSProperties } from "react";
import ClientShell from "../../../../../ClientShell";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import PackSelectionsForm from "./PackSelectionsForm";

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function PackSectionsEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: job, error: jobError }, { data: liftPlan, error: liftPlanError }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(`
          id,
          job_number,
          site_name,
          site_address,
          clients:client_id (
            company_name
          )
        `)
        .eq("id", params.id)
        .maybeSingle(),
      supabase
        .from("lift_plans")
        .select("pack_sections")
        .eq("job_id", params.id)
        .maybeSingle(),
    ]);

  const client = one((job as any)?.clients) as { company_name?: string | null } | null;
  const errorMessage = jobError?.message || liftPlanError?.message || "";

  return (
    <ClientShell>
      <div style={{ width: "min(1240px, 95vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={topRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Lift plan pack editor</h1>
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              Job {(job as any)?.job_number ? `#${(job as any).job_number}` : "—"} •{" "}
              {client?.company_name || "—"} • {(job as any)?.site_name || "—"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/jobs/${params.id}/lift-plan`} style={secondaryBtn}>
              ← Back to lift plan
            </a>
            <a href={`/jobs/${params.id}/lift-plan/pack`} target="_blank" style={secondaryBtn}>
              View full pack
            </a>
          </div>
        </div>

        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

        <PackSelectionsForm
          jobId={params.id}
          initialSections={((liftPlan as any)?.pack_sections as Record<string, string> | null) ?? null}
        />
      </div>
    </ClientShell>
  );
}

const topRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const secondaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};
