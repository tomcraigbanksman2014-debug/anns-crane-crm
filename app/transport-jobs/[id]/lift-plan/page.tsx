import type { CSSProperties } from "react";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import TransportLiftPlanForm from "../TransportLiftPlanForm";

function line(label: string, value: string | null | undefined) {
  return { label, value: String(value ?? "—").trim() || "—" };
}

export default async function TransportJobLiftPlanPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const [{ data: job, error: jobError }, { data: liftPlan, error: liftPlanError }] = await Promise.all([
    supabase
      .from("transport_jobs")
      .select(`
        id,
        transport_number,
        linked_job_id,
        job_type,
        collection_address,
        delivery_address,
        transport_date,
        delivery_date,
        collection_time,
        delivery_time,
        load_description,
        notes,
        clients:client_id (
          company_name,
          contact_name,
          phone,
          email
        ),
        vehicles:vehicle_id (
          name,
          reg_number,
          vehicle_type,
          trailer_type,
          capacity
        ),
        operators:operator_id (
          full_name
        )
      `)
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("transport_lift_plans").select("*").eq("transport_job_id", params.id).maybeSingle(),
  ]);

  const errorMessage = jobError?.message || liftPlanError?.message || "";

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={topRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>HIAB Transport Lift Plan</h1>
            <div style={{ marginTop: 6, opacity: 0.8 }}>Create and review lift plan / RAMS paperwork for transport and HIAB jobs.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/transport-jobs/${params.id}`} style={secondaryBtn}>← Back to transport job</a>
          </div>
        </div>

        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

        <div style={summaryCard}>
          <div style={summaryTitle}>Transport job summary</div>
          <div style={summaryGrid}>
            {[
              line("Transport job", job?.transport_number),
              line("Client", job?.clients?.company_name),
              line("Job type", job?.job_type),
              line("Collection", job?.collection_address),
              line("Delivery", job?.delivery_address),
              line("Dates", `${job?.transport_date ?? "—"} to ${job?.delivery_date ?? job?.transport_date ?? "—"}`),
              line("Times", `${job?.collection_time ?? "—"} to ${job?.delivery_time ?? "—"}`),
              line("Vehicle", [job?.vehicles?.name, job?.vehicles?.vehicle_type, job?.vehicles?.reg_number].filter(Boolean).join(" ")),
              line("Operator", job?.operators?.full_name),
              line("Linked crane job", job?.linked_job_id),
            ].map((item) => (
              <div key={item.label} style={summaryItem}>
                <div style={summaryLabel}>{item.label}</div>
                <div style={summaryValue}>{item.value}</div>
              </div>
            ))}
          </div>
          {job?.load_description ? (
            <div style={{ marginTop: 14 }}>
              <div style={summaryLabel}>Load description</div>
              <div style={notesBox}>{job.load_description}</div>
            </div>
          ) : null}
          {job?.notes ? (
            <div style={{ marginTop: 14 }}>
              <div style={summaryLabel}>Transport notes</div>
              <div style={notesBox}>{job.notes}</div>
            </div>
          ) : null}
        </div>

        <TransportLiftPlanForm transportJobId={params.id} initial={(liftPlan as any) ?? null} />
      </div>
    </ClientShell>
  );
}

const topRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" };
const summaryCard: CSSProperties = { background: "rgba(255,255,255,0.18)", padding: 18, borderRadius: 14, border: "1px solid rgba(255,255,255,0.4)", boxShadow: "0 8px 30px rgba(0,0,0,0.08)" };
const summaryTitle: CSSProperties = { fontSize: 20, fontWeight: 900, marginBottom: 12 };
const summaryGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
const summaryItem: CSSProperties = { background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12 };
const summaryLabel: CSSProperties = { fontSize: 12, fontWeight: 800, opacity: 0.7 };
const summaryValue: CSSProperties = { marginTop: 6, fontWeight: 800 };
const notesBox: CSSProperties = { marginTop: 6, background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12, whiteSpace: "pre-wrap" };
const errorBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(180,0,0,0.12)", border: "1px solid rgba(180,0,0,0.16)" };
const secondaryBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.82)", color: "#111", fontWeight: 800, textDecoration: "none", border: "1px solid rgba(0,0,0,0.10)" };
