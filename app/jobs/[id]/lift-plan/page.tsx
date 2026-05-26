import type { CSSProperties } from "react";
import { createClient } from "@supabase/supabase-js";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getPrimaryCraneContext, matchCraneJobEquipmentProfile } from "../../../lib/ai/matchEquipmentProfile";
import { attachCraneSpecDocumentsToJob } from "../../../lib/ai/craneSpecDocuments";
import LiftPlanForm from "../LiftPlanForm";
import RangeChartBuilder from "./RangeChartBuilder";
import DocumentUploadForm from "../DocumentUploadForm";
import AssetDocumentManager from "../../../components/AssetDocumentManager";
import LiftPlanAppendixSelector from "./LiftPlanAppendixSelector";
import LiftPlanArchiveManager from "./LiftPlanArchiveManager";
import {
  getCraneAppendixAssetsForPack,
  getJobSpecAppendixAssetsForPack,
  getJobSpecDocumentsForManager,
} from "../../../lib/assetDocuments";
import { rangeChartBuilderEnabled } from "../../../lib/features";

export const dynamic = "force-dynamic";

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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function tidyDisplayLabel(value: unknown) {
  const text = clean(value).replace(/\s+/g, " ");
  if (!text) return "";
  const words = text.split(" ").filter(Boolean);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const key = word.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result.join(" ").trim();
}

function craneDisplayLabel(crane: any, fallback?: unknown) {
  const name = clean(crane?.name);
  const make = clean(crane?.make);
  const model = clean(crane?.model);
  const capacity = clean(crane?.capacity);
  const base = tidyDisplayLabel([name, make, model].filter(Boolean).join(" ")) || clean(fallback);
  return [base, capacity && !base.toLowerCase().includes(capacity.toLowerCase()) ? capacity : ""].filter(Boolean).join(" ").trim();
}

function allocationLabel(row: any) {
  const crane = one(row?.cranes) as any;
  const operator = one(row?.operators) as any;
  const base = craneDisplayLabel(crane, row?.item_name) || "Allocated crane";
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

function archiveStatusLabel(value: unknown) {
  switch (String(value ?? "").trim()) {
    case "approved_copy":
      return "Approved copy";
    case "superseded":
      return "Superseded";
    case "client_copy":
      return "Client copy";
    case "other":
      return "Other";
    case "previous_draft":
    default:
      return "Previous draft";
  }
}


function getArchiveAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function loadLiftPlanPdfArchives(supabase: ReturnType<typeof createSupabaseServerClient>, jobId: string) {
  const archiveClient = getArchiveAdminClient() ?? supabase;
  const { data, error } = await archiveClient
    .from("lift_plan_pdf_archives")
    .select("id, title, archive_status, notes, file_name, file_path, file_type, file_size_bytes, uploaded_by_email, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) {
    return { archives: [] as any[], error: error.message };
  }

  const rows = (data as any[]) ?? [];
  const paths = rows.map((row) => String(row?.file_path ?? "").trim()).filter(Boolean);
  const signedMap = new Map<string, string>();

  if (paths.length) {
    const { data: signed } = await archiveClient.storage.from("job-documents").createSignedUrls(paths, 60 * 60);
    for (const item of signed ?? []) {
      if (item?.path && item?.signedUrl) signedMap.set(String(item.path), String(item.signedUrl));
    }
  }

  return {
    archives: rows.map((row) => {
      const path = String(row?.file_path ?? "").trim();
      return {
        id: String(row?.id ?? ""),
        title: row?.title ? String(row.title) : archiveStatusLabel(row?.archive_status),
        archive_status: row?.archive_status ? String(row.archive_status) : "previous_draft",
        notes: row?.notes ? String(row.notes) : null,
        file_name: row?.file_name ? String(row.file_name) : null,
        file_size_bytes: Number(row?.file_size_bytes ?? 0) || null,
        uploaded_by_email: row?.uploaded_by_email ? String(row.uploaded_by_email) : null,
        created_at: row?.created_at ? String(row.created_at) : null,
        signed_url: path ? signedMap.get(path) ?? null : null,
      };
    }),
    error: "",
  };
}

export default async function JobLiftPlanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { deleted?: string; delete_error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const rangeChartEnabled = rangeChartBuilderEnabled();

  const [
    { data: job, error: jobError },
    { data: liftPlan, error: liftPlanError },
    { data: documents, error: documentsError },
    { data: personnelRows, error: personnelError },
    { data: allCraneRows, error: allCranesError },
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
      supabase
        .from("cranes")
        .select("id, name, make, model, capacity, reg_number")
        .order("name", { ascending: true }),
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
  const craneLabelForAppendix = craneDisplayLabel(crane) || craneDisplayLabel(one((job as any)?.cranes)) || String((primary?.allocation as any)?.item_name ?? "");
  const craneAppendixContext = {
    craneName: craneLabelForAppendix,
    craneMake: (crane as any)?.make ?? null,
    craneModel: (crane as any)?.model ?? null,
    craneCapacity: (crane as any)?.capacity ?? null,
    liftType: (job as any)?.lift_type ?? (job as any)?.hire_type ?? null,
    craneConfiguration: String((packSections as any)?.range_chart_selected_setup_label ?? (packSections as any)?.boom_configuration ?? (liftPlan as any)?.crane_configuration ?? ""),
    loadDescription: String((liftPlan as any)?.method_statement ?? (job as any)?.notes ?? ""),
    notes: [
      (job as any)?.notes,
      (packSections as any)?.range_chart_selected_setup_label,
      (packSections as any)?.range_chart_selected_jib_label,
      (packSections as any)?.range_chart_external_spec_document_title,
    ].filter(Boolean).join(" "),
  };
  const [jobSpecDocuments, craneSpecAppendixAssets, jobSpecAppendixAssets] = await Promise.all([
    getJobSpecDocumentsForManager(params.id),
    getCraneAppendixAssetsForPack(linkedCraneIdForAppendix, craneAppendixContext),
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

  const baseErrorMessage = jobError?.message || liftPlanError?.message || documentsError?.message || personnelError?.message || "";

  const deletedOk = String(searchParams?.deleted ?? "") === "1";
  const deleteError = String(searchParams?.delete_error ?? "").trim();

  const craneLabel = craneDisplayLabel(crane) || "—";
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

  const alternativeCraneOptions = Array.from(
    new Map(
      [
        ...craneOptions,
        ...(((allCraneRows as any[]) ?? []).map((row) => ({
          value: `fleet:${String(row?.id ?? "")}`,
          craneId: String(row?.id ?? ""),
          label: craneDisplayLabel(row) || String(row?.name || row?.model || "Crane"),
        }))),
      ]
        .filter((option) => String(option.craneId || option.label || "").trim())
        .map((option) => [String(option.craneId || option.label).toLowerCase(), option])
    ).values()
  );

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

  const allRangeChartSetupOptions = Array.from(
    new Map(
      [
        ...(equipmentProfile?.setupOptions ?? []),
        ...Object.values(craneSetupOptionsByAllocation).flat(),
      ].map((option: any) => [String(option?.key || option?.label || ""), option])
    ).values()
  ).filter((option: any) => String(option?.key || option?.label || "").trim());

  const externalSpecOptions = jobSpecDocuments.map((doc: any) => ({
    id: String(doc.id ?? ""),
    title: String(doc.title || doc.file_name || "Uploaded job spec sheet"),
    document_type: doc.document_type ?? null,
  })).filter((doc) => doc.id);

  const appendixDocs = ((documents as any[]) ?? []).filter(isAppendixImageDoc);
  const otherDocs = ((documents as any[]) ?? []).filter((doc) => !isAppendixImageDoc(doc));
  const { archives: liftPlanPdfArchives, error: archiveError } = await loadLiftPlanPdfArchives(supabase, params.id);
  const errorMessage = baseErrorMessage || archiveError || "";

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

        <LiftPlanArchiveManager
          jobId={params.id}
          initialArchives={liftPlanPdfArchives}
        />

        <details style={uploadCard} open={craneIsExternal || jobSpecDocuments.length > 0}>
          <summary style={sectionSummary}>
            <span>Alternative / external crane spec sheets</span>
            <span style={summaryHint}>{craneIsExternal ? "External crane in use" : "Optional for cross-hire or crane comparison"}</span>
          </summary>
          <div style={{ fontSize: 14, opacity: 0.8, margin: "10px 0 12px" }}>
            Upload a spec sheet or load chart here when the lift is being planned around a subcontracted crane, cross-hired crane, or another crane option that is not the selected CRM fleet crane. These job-specific spec sheets can be selected in the range chart builder and included in the pack, but still require appointed-person verification.
          </div>
          <AssetDocumentManager
            assetLabel="Lift plan / alternative crane"
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

        <div style={ownedCraneSpecNotice}>
          <strong>Selected CRM crane spec sheets are still used where available.</strong> Use the selector below to tick the crane spec/load-chart pages that should go into the pack. For another crane, upload it above and select it in the range chart builder.
        </div>

        <LiftPlanAppendixSelector
          jobId={params.id}
          items={specAppendixItems}
          initialSelectedKeys={savedAppendixSelection ?? []}
          hasSavedSelection={savedAppendixSelection !== null}
        />

        {rangeChartEnabled ? (
          <RangeChartBuilder
            jobId={params.id}
            initialSections={packSections as Record<string, string | null>}
            defaultClientName={client?.company_name || ""}
            defaultCraneName={craneLabel}
            defaultNotes={(job as any)?.site_name || (job as any)?.notes || ""}
            liftRadiusM={Number((liftPlan as any)?.lift_radius ?? 0) || null}
            liftHeightM={Number((liftPlan as any)?.lift_height ?? 0) || null}
            loadWeightKg={Number((liftPlan as any)?.load_weight ?? 0) || null}
            setupOptions={allRangeChartSetupOptions as any}
            externalSpecOptions={externalSpecOptions}
          />
        ) : (
          <div style={ownedCraneSpecNotice}>
            <strong>Range chart builder is currently disabled.</strong> Set RANGE_CHART_BUILDER_ENABLED=true in Vercel to show the AnnS range chart / lift sketch tool.
          </div>
        )}

        <LiftPlanForm
          jobId={params.id}
          initial={(liftPlan as any) ?? null}
          equipmentProfile={equipmentProfile ?? null}
          craneOptions={craneOptions}
          alternativeCraneOptions={alternativeCraneOptions}
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
