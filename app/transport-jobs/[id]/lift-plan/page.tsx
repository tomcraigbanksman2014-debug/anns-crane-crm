import type { CSSProperties } from "react";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { matchTransportJobEquipmentProfile } from "../../../lib/ai/matchEquipmentProfile";
import TransportLiftPlanForm from "../TransportLiftPlanForm";
import TransportDocumentUploadForm from "../TransportDocumentUploadForm";
import TransportDocumentDeleteButton from "../TransportDocumentDeleteButton";

function line(label: string, value: string | null | undefined) {
  return { label, value: String(value ?? "—").trim() || "—" };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function publicDocumentUrl(filePath: string | null | undefined) {
  if (!filePath || !process.env.NEXT_PUBLIC_SUPABASE_URL) return "#";
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-documents/${filePath}`;
}

export default async function TransportJobLiftPlanPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const [
    { data: job, error: jobError },
    { data: liftPlan, error: liftPlanError },
    { data: transportDocuments, error: documentError },
    { data: personnelRows, error: personnelError },
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
      .from("transport_job_documents")
      .select("id, file_name, file_path, file_type, document_type, created_at")
      .eq("transport_job_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("operators")
      .select("id, full_name, status, archived")
      .or("archived.is.null,archived.eq.false")
      .order("full_name", { ascending: true }),
  ]);

  const client = one((job as any)?.clients) as any;
  const vehicle = one((job as any)?.vehicles) as any;
  const operator = one((job as any)?.operators) as any;

  let linkedJob: any = null;
  if ((job as any)?.linked_job_id) {
    const { data } = await supabase
      .from("jobs")
      .select("id, job_number, site_name, site_address, notes, lift_type, hire_type, cranes:crane_id (name, make, model, capacity)")
      .eq("id", (job as any).linked_job_id)
      .maybeSingle();
    linkedJob = data ?? null;
  }

  const equipmentProfile = matchTransportJobEquipmentProfile({ ...(job as any), vehicles: vehicle }, linkedJob);
  const errorMessage = jobError?.message || liftPlanError?.message || documentError?.message || personnelError?.message || "";
  const appendixDocuments = (transportDocuments ?? []).filter((doc: any) =>
    ["site_drawing", "drawing", "photo", "dimension_sheet", "weight_sheet", "vehicle_configuration", "rams"]
      .includes(String(doc.document_type ?? "").toLowerCase())
  );
  const vehicleDocuments = Array.isArray(vehicle?.vehicle_documents) ? vehicle.vehicle_documents : [];
  const personnelOptions = ((personnelRows as any[]) ?? [])
    .filter((row) => String(row?.full_name ?? "").trim())
    .map((row) => ({
      value: String(row.full_name).trim(),
      label: String(row.full_name).trim(),
    }));
  const liftPlanInitial = {
    ...((liftPlan as any) ?? {}),
    job_summary:
      (liftPlan as any)?.job_summary ??
      [
        (job as any)?.transport_number ? `Transport ${(job as any).transport_number}` : null,
        (job as any)?.job_type,
        client?.company_name,
      ].filter(Boolean).join(" - "),
    load_description: (liftPlan as any)?.load_description ?? (job as any)?.load_description ?? "",
    route_notes:
      (liftPlan as any)?.route_notes ??
      [
        (job as any)?.collection_address ? `Collection: ${(job as any).collection_address}` : null,
        (job as any)?.delivery_address ? `Delivery: ${(job as any).delivery_address}` : null,
      ].filter(Boolean).join("\n"),
    access_notes: (liftPlan as any)?.access_notes ?? (job as any)?.notes ?? "",
    operator_name: (liftPlan as any)?.operator_name ?? operator?.full_name ?? "",
  };

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={topRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>HIAB Lift Plan</h1>
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              Create and review lift plan / RAMS paperwork using the same workflow as crane lift plans.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/transport-jobs/${params.id}`} style={secondaryBtn}>← Back to transport job</a>
            <a href={`/transport-jobs/${params.id}/lift-plan/pack`} target="_blank" style={secondaryBtn}>Full lift plan pack / edit</a>
            <a href={`/transport-jobs/${params.id}/lift-plan/pack/edit`} style={secondaryBtn}>Pack wording</a>
          </div>
        </div>

        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

        <div style={summaryCard}>
          <div style={summaryTitle}>Job summary</div>
          <div style={summaryGrid}>
            {[
              line("Transport job", (job as any)?.transport_number),
              line("Client", client?.company_name),
              line("Job type", (job as any)?.job_type),
              line("Collection", (job as any)?.collection_address),
              line("Delivery", (job as any)?.delivery_address),
              line("Dates", `${(job as any)?.transport_date ?? "—"} to ${(job as any)?.delivery_date ?? (job as any)?.transport_date ?? "—"}`),
              line("Times", `${(job as any)?.collection_time ?? "—"} to ${(job as any)?.delivery_time ?? "—"}`),
              line("Selected HIAB", [vehicle?.name, vehicle?.vehicle_type, vehicle?.reg_number].filter(Boolean).join(" ")),
              line("Main operator", operator?.full_name),
              line("Linked crane job", linkedJob?.job_number ? `#${linkedJob.job_number}` : (job as any)?.linked_job_id),
            ].map((item) => (
              <div key={item.label} style={summaryItem}>
                <div style={summaryLabel}>{item.label}</div>
                <div style={summaryValue}>{item.value}</div>
              </div>
            ))}
          </div>
          {(job as any)?.load_description ? <div style={{ marginTop: 14 }}><div style={summaryLabel}>Load description</div><div style={notesBox}>{(job as any).load_description}</div></div> : null}
          {(job as any)?.notes ? <div style={{ marginTop: 14 }}><div style={summaryLabel}>Job notes</div><div style={notesBox}>{(job as any).notes}</div></div> : null}
        </div>

        <div style={summaryCard}>
          <div style={summaryTitle}>Lift plan appendix uploads</div>
          <div style={introText}>
            Upload HIAB position sketches, marked-up site drawings, dimension sheets, photographs and supporting RAMS here, as on the crane lift-plan page.
          </div>
          <TransportDocumentUploadForm transportJobId={params.id} />
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {appendixDocuments.length ? appendixDocuments.map((doc: any) => (
              <div key={doc.id} style={documentCard}>
                <div>
                  <div style={{ fontWeight: 900 }}>{doc.file_name || "Document"}</div>
                  <div style={documentMeta}>{String(doc.document_type || "other").replace(/_/g, " ")} • {doc.created_at || ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a href={publicDocumentUrl(doc.file_path)} target="_blank" rel="noreferrer" style={secondaryBtn}>Open</a>
                  <TransportDocumentDeleteButton transportJobId={params.id} documentId={doc.id} />
                </div>
              </div>
            )) : <div style={emptyState}>No lift-plan drawings or supporting documents uploaded yet.</div>}
          </div>
        </div>

        <div style={summaryCard}>
          <div style={summaryTitle}>Selected HIAB specification and load charts</div>
          <div style={introText}>
            The selected vehicle profile and verified manufacturer chart drive the technical check. A hired HIAB must have its supplier specification attached before the plan is finalised.
          </div>
          <div style={summaryGrid}>
            <div style={summaryItem}>
              <div style={summaryLabel}>Matched machine profile</div>
              <div style={summaryValue}>{equipmentProfile?.title || "No verified HIAB profile matched"}</div>
            </div>
            <div style={summaryItem}>
              <div style={summaryLabel}>Vehicle specification documents</div>
              <div style={summaryValue}>{vehicleDocuments.length}</div>
            </div>
          </div>
          {vehicleDocuments.length ? (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {vehicleDocuments.map((doc: any) => (
                <div key={doc.id} style={documentCard}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{doc.title || "Vehicle document"}</div>
                    <div style={documentMeta}>{String(doc.document_type || "document").replace(/_/g, " ")}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <TransportLiftPlanForm
          transportJobId={params.id}
          initial={liftPlanInitial}
          equipmentProfile={equipmentProfile}
          personnelOptions={personnelOptions}
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
const introText: CSSProperties = { fontSize: 14, opacity: 0.8, marginBottom: 12 };
const documentCard: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12 };
const documentMeta: CSSProperties = { marginTop: 4, fontSize: 12, opacity: 0.72, textTransform: "capitalize" };
const emptyState: CSSProperties = { padding: 14, borderRadius: 12, border: "1px dashed rgba(0,0,0,0.18)", opacity: 0.72 };
const errorBox: CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(180,0,0,0.12)", border: "1px solid rgba(180,0,0,0.16)" };
const secondaryBtn: CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.82)", color: "#111", fontWeight: 800, textDecoration: "none", border: "1px solid rgba(0,0,0,0.10)" };
