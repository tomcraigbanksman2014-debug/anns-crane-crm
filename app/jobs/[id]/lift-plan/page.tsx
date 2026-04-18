import type { CSSProperties } from "react";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getPrimaryCraneContext, matchCraneJobEquipmentProfile } from "../../../lib/ai/matchEquipmentProfile";
import LiftPlanForm from "../LiftPlanForm";

function line(label: string, value: string | null | undefined) {
  return { label, value: String(value ?? "—").trim() || "—" };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function JobLiftPlanPage({ params }: { params: { id: string } }) {
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
          contact_name,
          contact_phone,
          start_date,
          end_date,
          job_date,
          start_time,
          end_time,
          hire_type,
          lift_type,
          notes,
          clients:client_id (
            company_name,
            contact_name,
            phone,
            email
          ),
          cranes:crane_id (
            id,
            name,
            make,
            model,
            capacity,
            reg_number
          ),
          operators:operator_id (
            id,
            full_name
          ),
          main_operator:main_operator_id (
            id,
            full_name
          ),
          job_equipment (
            id,
            asset_type,
            source_type,
            item_name,
            start_date,
            end_date,
            start_time,
            end_time,
            crane_id,
            operator_id,
            cranes:crane_id (
              id,
              name,
              make,
              model,
              capacity,
              reg_number
            ),
            operators:operator_id (
              id,
              full_name
            )
          )
        `)
        .eq("id", params.id)
        .maybeSingle(),
      supabase.from("lift_plans").select("*").eq("job_id", params.id).maybeSingle(),
    ]);

  const client = one((job as any)?.clients) as
    | { company_name?: string | null; contact_name?: string | null; phone?: string | null; email?: string | null }
    | null;

  const primary = getPrimaryCraneContext(job as any);
  const crane = primary?.crane ?? (one((job as any)?.cranes) as
    | { name?: string | null; make?: string | null; model?: string | null; capacity?: string | null }
    | null);
  const operator = primary?.operator ??
    (one((job as any)?.main_operator) as { full_name?: string | null } | null) ??
    (one((job as any)?.operators) as { full_name?: string | null } | null);

  const equipmentProfile = matchCraneJobEquipmentProfile(job as any);
  const errorMessage = jobError?.message || liftPlanError?.message || "";

  const craneLabel = [crane?.name, crane?.make, crane?.model].filter(Boolean).join(" ") || crane?.name || "—";

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={topRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Crane Lift Plan</h1>
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              Create and review lift plan / RAMS paperwork for crane jobs.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/jobs/${params.id}`} style={secondaryBtn}>
              ← Back to job
            </a>
            <a href={`/jobs/${params.id}/lift-plan/print`} target="_blank" style={secondaryBtn}>
              Printable version
            </a>
            <a href={`/jobs/${params.id}/lift-plan/pack`} target="_blank" style={secondaryBtn}>
              Full lift plan pack
            </a>
          </div>
        </div>

        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

        <div style={summaryCard}>
          <div style={summaryTitle}>Job summary</div>
          <div style={summaryGrid}>
            {[
              line("Job", (job as any)?.job_number ? `#${(job as any).job_number}` : "—"),
              line("Client", client?.company_name),
              line("Site", (job as any)?.site_name),
              line("Address", (job as any)?.site_address),
              line(
                "Dates",
                `${(job as any)?.start_date ?? (job as any)?.job_date ?? "—"} to ${
                  (job as any)?.end_date ?? (job as any)?.job_date ?? "—"
                }`
              ),
              line("Times", `${(job as any)?.start_time ?? "—"} to ${(job as any)?.end_time ?? "—"}`),
              line("Hire type", (job as any)?.hire_type),
              line("Lift type", (job as any)?.lift_type),
              line("Crane", craneLabel),
              line("Main operator", operator?.full_name),
            ].map((item) => (
              <div key={item.label} style={summaryItem}>
                <div style={summaryLabel}>{item.label}</div>
                <div style={summaryValue}>{item.value}</div>
              </div>
            ))}
          </div>

          {(job as any)?.notes ? (
            <div style={{ marginTop: 14 }}>
              <div style={summaryLabel}>Job notes</div>
              <div style={notesBox}>{(job as any).notes}</div>
            </div>
          ) : null}
        </div>

        <LiftPlanForm
          jobId={params.id}
          initial={(liftPlan as any) ?? null}
          equipmentProfile={equipmentProfile ?? null}
        />
      </div>
    </ClientShell>
  );
}

const topRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const summaryCard: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const summaryTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  marginBottom: 12,
};

const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const summaryItem: CSSProperties = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 12,
};

const summaryLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.7,
};

const summaryValue: CSSProperties = {
  marginTop: 6,
  fontWeight: 800,
};

const notesBox: CSSProperties = {
  marginTop: 6,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 12,
  whiteSpace: "pre-wrap",
};

const errorBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
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
