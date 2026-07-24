import type { CSSProperties } from "react";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { matchTransportJobEquipmentProfile } from "../../../lib/ai/matchEquipmentProfile";
import {
  buildTransportLiftPlanContext,
  defaultTransportLiftPlanValues,
} from "../../../lib/transportLiftPlanDefaults";
import TransportLiftPlanForm from "../TransportLiftPlanForm";

function line(label: string, value: string | null | undefined) {
  return { label, value: String(value ?? "—").trim() || "—" };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function TransportJobLiftPlanPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const [
    { data: job, error: jobError },
    { data: liftPlan, error: liftPlanError },
    { data: people, error: peopleError },
    { data: liftingEquipment, error: equipmentError },
  ] = await Promise.all([
    supabase.from("transport_jobs").select(`
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
      load_length_m,
      load_width_m,
      load_height_m,
      load_weight_t,
      notes,
      clients:client_id (company_name, contact_name, phone, email),
      vehicles:vehicle_id (
        id,
        name,
        reg_number,
        vehicle_type,
        trailer_type,
        capacity,
        vehicle_documents (id, title, document_type, extracted_text, extracted_profile, uploaded_at)
      ),
      operators:operator_id (full_name)
    `).eq("id", params.id).maybeSingle(),
    supabase.from("transport_lift_plans").select("*").eq("transport_job_id", params.id).maybeSingle(),
    supabase
      .from("operators")
      .select("full_name")
      .eq("archived", false)
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("equipment")
      .select("id, name, asset_number, type, capacity, notes")
      .eq("archived", false)
      .neq("status", "out_of_service")
      .order("name"),
  ]);

  const client = one((job as any)?.clients) as any;
  const vehicle = one((job as any)?.vehicles) as any;
  const operator = one((job as any)?.operators) as any;

  let linkedJob: any = null;
  if ((job as any)?.linked_job_id) {
    const { data } = await supabase
      .from("jobs")
      .select(`id, job_number, site_name, site_address, notes, lift_type, hire_type, cranes:crane_id (name, make, model, capacity)`)
      .eq("id", (job as any).linked_job_id)
      .maybeSingle();
    linkedJob = data ?? null;
  }

  const equipmentProfile = matchTransportJobEquipmentProfile({ ...(job as any), vehicles: vehicle }, linkedJob);
  const context = buildTransportLiftPlanContext({ job, client, vehicle, operator, linkedJob });
  const defaults = defaultTransportLiftPlanValues(context, equipmentProfile);
  const personnelOptions = Array.from(new Set([
    "Shaun Robinson",
    ...((people ?? []) as Array<{ full_name?: string | null }>).map((person) => String(person.full_name ?? "").trim()),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const liftEquipmentOptions = ((liftingEquipment ?? []) as Array<Record<string, any>>)
    .filter((item) => /(mat|spreader|pad|sling|chain|shackle|beam|lug|hook|lifting)/i.test(
      [item.name, item.type, item.notes].filter(Boolean).join(" "),
    ))
    .map((item) => ({
      id: String(item.id),
      label: [item.name, item.asset_number, item.capacity].filter(Boolean).join(" / "),
      type: String(item.type ?? ""),
      capacity: String(item.capacity ?? ""),
      notes: String(item.notes ?? ""),
    }));
  const errorMessage = jobError?.message || liftPlanError?.message || peopleError?.message || equipmentError?.message || "";

  return (
    <ClientShell>
      <div style={{ width: "min(1780px, 98vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={topRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>HIAB Transport Lift Plan</h1>
            <div style={{ marginTop: 6, opacity: 0.8 }}>Create and review lift plan / RAMS paperwork for transport and HIAB jobs.</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/transport-jobs/${params.id}`} style={secondaryBtn}>← Back to transport job</a>
            <a href={`/transport-jobs/${params.id}/lift-plan/pack`} target="_blank" style={secondaryBtn}>Full HIAB pack</a>
            <a href={`/transport-jobs/${params.id}/lift-plan/pack/edit`} style={secondaryBtn}>Edit pack sections</a>
          </div>
        </div>

        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

        <div style={summaryCard}>
          <div style={summaryTitle}>Transport job summary</div>
          <div style={summaryGrid}>
            {[
              line("Transport job", (job as any)?.transport_number),
              line("Client", client?.company_name),
              line("Job type", (job as any)?.job_type),
              line("Collection", (job as any)?.collection_address),
              line("Delivery", (job as any)?.delivery_address),
              line("Dates", `${(job as any)?.transport_date ?? "—"} to ${(job as any)?.delivery_date ?? (job as any)?.transport_date ?? "—"}`),
              line("Times", `${(job as any)?.collection_time ?? "—"} to ${(job as any)?.delivery_time ?? "—"}`),
              line("Vehicle", [vehicle?.name, vehicle?.vehicle_type, vehicle?.reg_number].filter(Boolean).join(" ")),
              line("Operator", operator?.full_name),
              line("Linked crane job", linkedJob?.job_number ? `#${linkedJob.job_number}` : (job as any)?.linked_job_id),
            ].map((item) => <div key={item.label} style={summaryItem}><div style={summaryLabel}>{item.label}</div><div style={summaryValue}>{item.value}</div></div>)}
          </div>
          {(job as any)?.load_description ? <div style={{ marginTop: 14 }}><div style={summaryLabel}>Load description</div><div style={notesBox}>{(job as any).load_description}</div></div> : null}
          {(job as any)?.notes ? <div style={{ marginTop: 14 }}><div style={summaryLabel}>Transport notes</div><div style={notesBox}>{(job as any).notes}</div></div> : null}
        </div>

        <TransportLiftPlanForm
          transportJobId={params.id}
          initial={(liftPlan as any) ?? null}
          equipmentProfile={equipmentProfile}
          context={context}
          defaults={defaults}
          personnelOptions={personnelOptions}
          liftEquipmentOptions={liftEquipmentOptions}
        />
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
