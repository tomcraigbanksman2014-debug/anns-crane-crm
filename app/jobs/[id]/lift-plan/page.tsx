import type { CSSProperties } from "react";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getPrimaryCraneContext, matchCraneJobEquipmentProfile } from "../../../lib/ai/matchEquipmentProfile";
import LiftPlanForm from "../LiftPlanForm";
import DocumentUploadForm from "../DocumentUploadForm";

function line(label: string, value: string | null | undefined) {
  return { label, value: String(value ?? "—").trim() || "—" };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function flatten<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function allocationLabel(row: any) {
  const crane = one(row?.cranes) as any;
  const operator = one(row?.operators) as any;
  const base =
    [crane?.name, crane?.make, crane?.model].filter(Boolean).join(" ") ||
    row?.item_name ||
    "Allocated crane";
  const dateText = [row?.start_date, row?.end_date].filter(Boolean).join(" to ");
  const operatorText = operator?.full_name ? `Operator: ${operator.full_name}` : "";
  return [base, dateText, operatorText].filter(Boolean).join(" • ");
}

function documentTypeLabel(value: string | null | undefined) {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "site_drawing":
      return "Site drawing";
    case "photo":
      return "Photo / diagram";
    case "lift_plan":
      return "Lift plan";
    case "rams":
      return "RAMS";
    case "delivery_note":
      return "Delivery note";
    default:
      return "Other";
  }
}

function isAppendixImageDoc(doc: any) {
  const fileType = String(doc?.file_type ?? "").trim().toLowerCase();
  const fileName = String(doc?.file_name ?? "").trim().toLowerCase();
  return (
    fileType.startsWith("image/") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".webp") ||
    fileName.endsWith(".gif")
  );
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB");
}

export default async function JobLiftPlanPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const [{ data: job, error: jobError }, { data: liftPlan, error: liftPlanError }, { data: documents, error: documentsError }] =
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
      supabase
        .from("job_documents")
        .select("id, file_name, file_type, document_type, created_at, share_with_operator")
        .eq("job_id", params.id)
        .order("created_at", { ascending: false }),
    ]);

  const client = one((job as any)?.clients) as
    | { company_name?: string | null; contact_name?: string | null; phone?: string | null; email?: string | null }
    | null;

  const selectedJob = {
    ...(job as any),
    selected_job_equipment_id: (liftPlan as any)?.selected_job_equipment_id ?? null,
    selected_crane_id: (liftPlan as any)?.selected_crane_id ?? null,
  };

  const primary = getPrimaryCraneContext(selectedJob);
  const crane =
    primary?.crane ??
    (one((job as any)?.cranes) as
      | { id?: string | null; name?: string | null; make?: string | null; model?: string | null; capacity?: string | null }
      | null);
  const operator =
    primary?.operator ??
    (one((job as any)?.main_operator) as { full_name?: string | null } | null) ??
    (one((job as any)?.operators) as { full_name?: string | null } | null);

  const equipmentProfile = matchCraneJobEquipmentProfile({
    ...selectedJob,
    cranes: crane ? [crane] : flatten((job as any)?.cranes),
    job_equipment: (job as any)?.job_equipment ?? [],
  });
  const errorMessage = jobError?.message || liftPlanError?.message || documentsError?.message || "";

  const craneLabel = [crane?.name, crane?.make, crane?.model].filter(Boolean).join(" ") || crane?.name || "—";
  const craneOptions = flatten((job as any)?.job_equipment)
    .filter((row) => {
      const type = String(row?.asset_type ?? row?.source_type ?? "").toLowerCase();
      return type === "crane" || !!row?.crane_id || !!one(row?.cranes);
    })
    .map((row) => {
      const craneRow = one(row?.cranes) as any;
      return {
        value: String(row?.id ?? ""),
        craneId: String(craneRow?.id ?? row?.crane_id ?? ""),
        label: allocationLabel(row),
      };
    });

  if (craneOptions.length === 0 && crane?.id) {
    craneOptions.push({ value: `fallback:${crane.id}`, craneId: String(crane.id), label: craneLabel });
  }

  const appendixDocs = ((documents as any[]) ?? []).filter(isAppendixImageDoc);
  const otherDocs = ((documents as any[]) ?? []).filter((doc) => !isAppendixImageDoc(doc));

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
              Full lift plan pack / edit
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
              line("Selected crane", craneLabel),
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

        <div style={uploadCard}>
          <div style={summaryTitle}>Lift plan appendix uploads</div>
          <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 12 }}>
            Upload crane position sketches, diagrams, marked-up site drawings, and photos here. Image uploads are appended into the full lift plan pack as extra pages.
          </div>

          <DocumentUploadForm jobId={params.id} />

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {appendixDocs.length ? (
              <>
                <div style={listTitle}>Appendix image pages that will be added to the full pack</div>
                <div style={docGrid}>
                  {appendixDocs.map((doc: any) => (
                    <div key={doc.id} style={docCard}>
                      <div style={{ fontWeight: 900 }}>{doc.file_name ?? "Untitled file"}</div>
                      <div style={docMeta}>
                        {documentTypeLabel(doc.document_type)} • Uploaded {fmtDateTime(doc.created_at)}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        <span style={appendixPill}>Pack appendix page</span>
                        {doc.share_with_operator ? <span style={neutralPill}>Shared with operator</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={emptyBox}>No appendix image uploads yet.</div>
            )}

            {otherDocs.length ? (
              <>
                <div style={listTitle}>Other uploaded job documents</div>
                <div style={docGrid}>
                  {otherDocs.map((doc: any) => (
                    <div key={doc.id} style={docCard}>
                      <div style={{ fontWeight: 900 }}>{doc.file_name ?? "Untitled file"}</div>
                      <div style={docMeta}>
                        {documentTypeLabel(doc.document_type)} • Uploaded {fmtDateTime(doc.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <LiftPlanForm
          jobId={params.id}
          initial={(liftPlan as any) ?? null}
          equipmentProfile={equipmentProfile ?? null}
          craneOptions={craneOptions}
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

const uploadCard: CSSProperties = {
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

const docGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const docCard: CSSProperties = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 12,
};

const docMeta: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  opacity: 0.78,
};

const listTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
};

const appendixPill: CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,120,255,0.12)",
  color: "#0b57d0",
  fontSize: 12,
  fontWeight: 800,
};

const neutralPill: CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  color: "#111",
  fontSize: 12,
  fontWeight: 700,
};

const emptyBox: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
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
