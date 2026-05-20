import type { CSSProperties } from "react";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getPrimaryCraneContext, matchCraneJobEquipmentProfile } from "../../../lib/ai/matchEquipmentProfile";
import { attachCraneSpecDocumentsToJob } from "../../../lib/ai/craneSpecDocuments";
import LiftPlanForm from "../LiftPlanForm";
import DocumentUploadForm from "../DocumentUploadForm";
import AssetDocumentManager from "../../../components/AssetDocumentManager";
import LiftPlanAppendixSelector from "./LiftPlanAppendixSelector";
import {
  getCraneAppendixAssetsForPack,
  getJobSpecAppendixAssetsForPack,
  getJobSpecDocumentsForManager,
} from "../../../lib/assetDocuments";

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
    case "spec_sheet":
      return "Specification sheet";
    case "load_chart":
      return "Load chart";
    case "manual":
      return "Manual";
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


function realLinkedCraneId(job: any, liftPlan: any, primary: any, crane: any) {
  const fromSelectedCrane = String(liftPlan?.selected_crane_id ?? "").trim();
  if (fromSelectedCrane) return fromSelectedCrane;

  const allocations = flatten((job as any)?.job_equipment);
  const selectedAllocationId = String(liftPlan?.selected_job_equipment_id ?? "").trim();
  if (selectedAllocationId) {
    const selectedAllocation = allocations.find((row: any) => String(row?.id ?? "").trim() === selectedAllocationId);
    const selectedAllocationCrane = one(selectedAllocation?.cranes) as any;
    const selectedAllocationCraneId = String(selectedAllocation?.crane_id ?? selectedAllocationCrane?.id ?? "").trim();
    if (selectedAllocationCraneId) return selectedAllocationCraneId;
  }

  const primaryAllocationCrane = one(primary?.allocation?.cranes) as any;
  const fromPrimaryAllocation = String(primary?.allocation?.crane_id ?? primaryAllocationCrane?.id ?? "").trim();
  if (fromPrimaryAllocation) return fromPrimaryAllocation;

  const fromDisplayedCrane = String(crane?.id ?? "").trim();
  if (fromDisplayedCrane) return fromDisplayedCrane;

  const firstJobCrane = one((job as any)?.cranes) as any;
  return String(firstJobCrane?.id ?? "").trim() || null;
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB");
}

function parseSelectedAppendixKeys(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  } catch {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

export default async function JobLiftPlanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { deleted?: string; delete_error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: job, error: jobError },
    { data: liftPlan, error: liftPlanError },
    { data: documents, error: documentsError },
    { data: personnelRows, error: personnelError },
  ] = await Promise.all([
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
      supabase
        .from("operators")
        .select("id, full_name, status, archived")
        .or("archived.is.null,archived.eq.false")
        .order("full_name", { ascending: true }),
    ]);

  const client = one((job as any)?.clients) as
    | { company_name?: string | null; contact_name?: string | null; phone?: string | null; email?: string | null }
    | null;

  await attachCraneSpecDocumentsToJob(supabase, job as any);

  const selectedJob = {
    ...(job as any),
    selected_job_equipment_id: (liftPlan as any)?.selected_job_equipment_id ?? null,
    selected_crane_id: (liftPlan as any)?.selected_crane_id ?? null,
    pack_sections: (liftPlan as any)?.pack_sections ?? null,
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

  const personnelOptions = ((personnelRows as any[]) ?? [])
    .filter((row) => String(row?.full_name ?? "").trim())
    .map((row) => ({
      value: String(row.full_name).trim(),
      label: String(row.full_name).trim(),
    }));

  const equipmentProfile = matchCraneJobEquipmentProfile({
    ...selectedJob,
    cranes: crane ? [crane] : flatten((job as any)?.cranes),
    job_equipment: (job as any)?.job_equipment ?? [],
  });

  const packSections = ((liftPlan as any)?.pack_sections as Record<string, unknown> | null) ?? {};
  const linkedCraneIdForAppendix = realLinkedCraneId(job, liftPlan, primary, crane);
  const [jobSpecDocuments, craneSpecAppendixAssets, jobSpecAppendixAssets] = await Promise.all([
    getJobSpecDocumentsForManager(params.id),
    getCraneAppendixAssetsForPack(linkedCraneIdForAppendix),
    getJobSpecAppendixAssetsForPack(params.id),
  ]);
  const specAppendixItems = [...craneSpecAppendixAssets, ...jobSpecAppendixAssets]
    .map((asset, index) => ({
      key: asset.key || `${asset.source_type ?? "appendix"}:${asset.source_document_id ?? asset.title}:${asset.page_number}:${index}`,
      title: asset.title,
      description: asset.description,
      image_url: asset.image_url,
      source_type: asset.source_type ?? null,
    }));
  const savedAppendixSelection = parseSelectedAppendixKeys(packSections.selected_appendix_keys);

  const errorMessage = jobError?.message || liftPlanError?.message || documentsError?.message || personnelError?.message || "";

  const deletedOk = String(searchParams?.deleted ?? "") === "1";
  const deleteError = String(searchParams?.delete_error ?? "").trim();

  const craneLabel = [crane?.name, crane?.make, crane?.model].filter(Boolean).join(" ") || crane?.name || "—";
  const allocationSource = String((primary?.allocation as any)?.source_type ?? "").toLowerCase();
  const craneIsExternal = Boolean((crane as any)?.external) || allocationSource.includes("cross") || allocationSource.includes("sub") || allocationSource.includes("hire");
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

  const craneSetupOptionsByAllocation = Object.fromEntries(
    craneOptions.map((option) => {
      const optionProfile = matchCraneJobEquipmentProfile({
        ...(job as any),
        selected_job_equipment_id: option.value,
        selected_crane_id: option.craneId || null,
        pack_sections: (liftPlan as any)?.pack_sections ?? null,
        cranes: flatten((job as any)?.cranes),
        job_equipment: (job as any)?.job_equipment ?? [],
      });
      return [option.value, optionProfile?.setupOptions ?? []];
    })
  );

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

        {deletedOk ? <div style={successBox}>Document removed.</div> : null}
        {deleteError ? <div style={errorBox}>{deleteError}</div> : null}

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
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                        <span style={appendixPill}>Pack appendix page</span>
                        {doc.share_with_operator ? <span style={neutralPill}>Shared with operator</span> : null}
                        <form action={`/api/jobs/${params.id}/documents/${doc.id}/delete`} method="post" style={{ marginLeft: "auto" }}>
                          <button type="submit" style={dangerBtn}>Remove</button>
                        </form>
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
                      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                        <form action={`/api/jobs/${params.id}/documents/${doc.id}/delete`} method="post">
                          <button type="submit" style={dangerBtn}>Remove</button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {craneIsExternal || jobSpecDocuments.length > 0 ? (
          <details style={uploadCard} open={craneIsExternal || jobSpecDocuments.length > 0}>
            <summary style={sectionSummary}>
              <span>Cross-hired / job-specific crane spec sheets</span>
              <span style={summaryHint}>Only shown for cross-hired / external cranes</span>
            </summary>
            <div style={{ fontSize: 14, opacity: 0.8, margin: "10px 0 12px" }}>
              Use this only when the crane is sub-hired, temporary, or the correct specification/load chart is not already stored against one of our crane records. For AnnS-owned cranes, upload and manage spec sheets on the crane record instead.
            </div>
            <AssetDocumentManager
              assetLabel="Lift plan crane"
              assetType="crane"
              assetProfile={{
                name: craneLabel,
                make: (crane as any)?.make ?? null,
                model: (crane as any)?.model ?? null,
                capacity: (crane as any)?.capacity ?? null,
              }}
              uploadUrl={`/api/jobs/${params.id}/lift-plan/spec-sheets/upload`}
              deleteUrlPrefix={`/api/jobs/${params.id}/lift-plan/spec-sheets`}
              initialDocuments={jobSpecDocuments}
              documentTypeOptions={[
                { value: "spec_sheet", label: "Specification sheet" },
                { value: "load_chart", label: "Load chart" },
                { value: "manual", label: "Manual / manufacturer document" },
              ]}
            />
          </details>
        ) : (
          <div style={ownedCraneSpecNotice}>
            <strong>Spec sheets for this crane are managed on the crane record.</strong> This lift plan will use the stored crane spec/load-chart pages below. Use the selector to tick the pages that should go into the pack.
          </div>
        )}

        <LiftPlanAppendixSelector
          jobId={params.id}
          items={specAppendixItems}
          initialSelectedKeys={savedAppendixSelection ?? []}
          hasSavedSelection={savedAppendixSelection !== null}
        />

        <LiftPlanForm
          jobId={params.id}
          initial={(liftPlan as any) ?? null}
          equipmentProfile={equipmentProfile ?? null}
          craneOptions={craneOptions}
          personnelOptions={personnelOptions}
          craneSetupOptions={equipmentProfile?.setupOptions ?? []}
          craneSetupOptionsByAllocation={craneSetupOptionsByAllocation}
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

const sectionSummary: CSSProperties = {
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 20,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const summaryHint: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.72,
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.65)",
};

const ownedCraneSpecNotice: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.65)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  lineHeight: 1.45,
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

const successBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,160,80,0.14)",
  border: "1px solid rgba(0,160,80,0.18)",
  color: "#0b6b34",
  fontWeight: 700,
};

const dangerBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(180,0,0,0.18)",
  background: "rgba(180,0,0,0.08)",
  color: "#8b0000",
  fontWeight: 800,
  cursor: "pointer",
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
