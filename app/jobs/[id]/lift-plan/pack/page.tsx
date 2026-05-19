import type { CSSProperties, ReactNode } from "react";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  getPrimaryCraneContext,
  matchCraneJobEquipmentProfile,
} from "../../../../lib/ai/matchEquipmentProfile";
import { getCraneAppendixAssetsForPack, type PackAppendixAssetItem } from "../../../../lib/assetDocuments";
import PrintPackButton from "./PrintPackButton";

type StringMap = Record<string, string | null>;

function flatten<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtMonthYear(value: string | Date | null | undefined) {
  const d = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
  return safeDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function val(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function calcDuration(start: string | null | undefined, end: string | null | undefined) {
  if (!start) return "—";
  const a = new Date(start);
  const b = new Date(end || start);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  const diff = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  return `${diff} day${diff === 1 ? "" : "s"}`;
}

function craneLabel(crane: any, allocation: any) {
  const parts = [crane?.name, crane?.make, crane?.model].filter(Boolean);
  return parts.join(" ").trim() || crane?.name || allocation?.item_name || "—";
}

function formatCapacity(profile: any, crane: any) {
  if (profile?.maxCapacityKg) {
    const kg = Number(profile.maxCapacityKg);
    const tonnes =
      profile?.maxCapacityTonnes ??
      (Number.isFinite(kg) ? Number((kg / 1000).toFixed(1)) : null);

    const kgText = Number.isFinite(kg) ? `${kg.toLocaleString("en-GB")} kg` : "";
    const tonneText = tonnes ? `${tonnes} t` : "";

    return [kgText, tonneText].filter(Boolean).join(" / ");
  }
  return crane?.capacity || "—";
}

function percentageUtilisation(loadWeight: any, capacityKg: any) {
  const load = Number(loadWeight || 0);
  const cap = Number(capacityKg || 0);
  if (!load || !cap) return "—";
  return `${Math.round((load / cap) * 100)}%`;
}

function splitLines(value: string | null | undefined) {
  if (!value) return [];
  return String(value)
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function para(value: string | null | undefined, fallback: string) {
  return value && String(value).trim() ? String(value) : fallback;
}

function sentenceCase(value: string | null | undefined, fallback: string) {
  return para(value, fallback).trim();
}

function tidyWhitespace(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortBoomConfiguration(
  override: string | null | undefined,
  liftPlanConfiguration: string | null | undefined,
  equipmentProfile: any
) {
  if (override && override.trim()) return override.trim();

  const source = tidyWhitespace(liftPlanConfiguration).toLowerCase();

  if (!source) {
    if (equipmentProfile?.machineType === "truck_crane") return "Main boom";
    if (equipmentProfile?.machineType === "crane") return "Main boom";
    if (equipmentProfile?.machineType === "spider") return "Main boom";
    return "Planned configuration";
  }

  if (source.includes("main boom") && source.includes("jib")) return "Main boom + jib";
  if (source.includes("main boom")) return "Main boom";
  if (source.includes("fly jib")) return "Main boom + fly jib";
  if (source.includes("jib")) return "Boom + jib";
  if (source.includes("platform") || source.includes("basket")) return "Lifting mode only";
  return liftPlanConfiguration?.trim() || "Planned configuration";
}

function shortBoomLength(
  override: string | null | undefined,
  equipmentProfile: any,
  craneName: string
) {
  if (override && override.trim()) return override.trim();

  if (equipmentProfile?.maxBoomLengthM) {
    return `${equipmentProfile.maxBoomLengthM} m max boom`;
  }

  if (equipmentProfile?.maxHydraulicOutreachM) {
    if (String(craneName).toLowerCase().includes("ak 46")) {
      return "44.0 m max extension";
    }
    return `${equipmentProfile.maxHydraulicOutreachM} m hydraulic outreach`;
  }

  return "Planned per selected chart";
}

function fallbackScope(clientName: string, projectName: string, liftPlan: any, loadWeight: string) {
  const loadText = liftPlan?.load_description || "the planned load";
  return `Works comprise the lifting operation for ${clientName} at ${projectName}. The planned load is ${loadText} with a stated load weight of ${loadWeight}. All lifting activities are to be carried out under the control of the appointed lifting team in accordance with the approved lift plan, site controls and current legislation.`;
}

function fallbackCommunication(siteContact: string) {
  return `Communication will be maintained using clear agreed hand signals in accordance with BS 7121, with two-way radio communication used if visibility or site layout requires it. The designated signaller will remain in control of crane movements and liaise with ${siteContact || "the site representative"} where necessary.`;
}

function coverAddress(job: any) {
  return [job?.site_name, job?.site_address].filter(Boolean).join(", ");
}

function formatOutreachReference(profile: any) {
  if (profile?.maxHydraulicOutreachM && profile?.maxRadiusM) {
    return `${profile.maxHydraulicOutreachM} m / ${profile.maxRadiusM} m radius`;
  }
  if (profile?.maxHydraulicOutreachM) return `${profile.maxHydraulicOutreachM} m`;
  if (profile?.maxBoomLengthM && profile?.maxRadiusM) {
    return `${profile.maxBoomLengthM} m boom / ${profile.maxRadiusM} m radius`;
  }
  if (profile?.maxBoomLengthM) return `${profile.maxBoomLengthM} m`;
  if (profile?.maxRadiusM) return `${profile.maxRadiusM} m radius`;
  return "—";
}

function formatJibReference(profile: any) {
  if (profile?.maxJibOutreachM) return `${profile.maxJibOutreachM} m`;
  if (profile?.maxRadiusM) return `${profile.maxRadiusM} m radius`;
  return "—";
}

function parseWeightToKg(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (!text || text === "—") return null;

  const match = text.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;

  const raw = Number(match[1]);
  if (!Number.isFinite(raw) || raw <= 0) return null;

  if (/\bkg\b|kilogram/.test(text)) return raw;
  if (/tonne|ton|\bt\b/.test(text)) return raw * 1000;

  // Crane capacities in the CRM are commonly entered as 35, 80 or 100 meaning tonnes.
  if (raw <= 250) return raw * 1000;

  return raw;
}

function formatKgAndTonnes(valueKg: number | null | undefined) {
  const kg = Number(valueKg ?? 0);
  if (!Number.isFinite(kg) || kg <= 0) return "—";
  const tonnes = kg / 1000;
  return `${kg.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg / ${tonnes.toLocaleString("en-GB", { maximumFractionDigits: 2 })} t`;
}

function PageShell({
  children,
  sectionTitle,
  headerTitle,
  headerSubtitle,
  headerMonth,
  footerText,
  breakAfter = true,
}: {
  children: ReactNode;
  sectionTitle: ReactNode;
  headerTitle?: ReactNode;
  headerSubtitle?: ReactNode;
  headerMonth?: ReactNode;
  footerText?: ReactNode;
  breakAfter?: boolean;
}) {
  return (
    <section
      className="lift-pack-page"
      style={{
        ...pageStyle,
        pageBreakAfter: breakAfter ? "always" : "auto",
        breakAfter: breakAfter ? "page" : "auto",
      }}
    >
      <PageHeader
        sectionTitle={sectionTitle}
        title={headerTitle}
        subtitle={headerSubtitle}
        month={headerMonth}
      />
      <div style={pageBody}>{children}</div>
      <PageFooter text={footerText} />
    </section>
  );
}

function PageHeader({
  sectionTitle,
  title,
  subtitle,
  month,
}: {
  sectionTitle: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  month?: ReactNode;
}) {
  return (
    <div style={pageHeader}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 auto" }}>
        <img src="/icon.png" alt="AnnS Crane Hire logo" style={logoStyle} />
        <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <div style={{ fontWeight: 900, letterSpacing: 0.5, overflowWrap: "anywhere" }}>{title ?? "ANNS – LIFTING PLAN – V1"}</div>
          <div style={{ fontSize: 11, opacity: 0.72, overflowWrap: "anywhere" }}>{subtitle ?? "Anns Crane Hire Ltd"}</div>
        </div>
      </div>
      <div style={{ textAlign: "right", minWidth: 150, maxWidth: 260, overflowWrap: "anywhere", wordBreak: "normal" }}>
        <div style={{ fontSize: 11, opacity: 0.7, overflowWrap: "anywhere" }}>{month ?? fmtMonthYear(new Date())}</div>
        <div style={{ fontWeight: 800, overflowWrap: "anywhere", lineHeight: 1.18 }}>{sectionTitle}</div>
      </div>
    </div>
  );
}

function PageFooter({ text }: { text?: ReactNode }) {
  return (
    <div style={pageFooter}>
      {text ?? "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk"}
    </div>
  );
}

function renderInfoValue(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return val(value);
  }
  return value;
}

function InfoTable({ rows }: { rows: Array<[ReactNode, any]> }) {
  return (
    <div style={infoTable}>
      {rows.map(([label, value], index) => (
        <div key={`${label}-${index}`} style={{ display: "contents" }}>
          <div style={infoLabel}>{label}</div>
          <div style={infoValue}>{renderInfoValue(value)}</div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={sectionTitleStyle}>{children}</h2>;
}

function BoxedParagraph({
  title,
  children,
  compact = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={{ ...boxed, ...(compact ? compactBoxed : null) }}>
      {title ? <div style={boxedTitle}>{title}</div> : null}
      <div style={boxedBody}>{children}</div>
    </div>
  );
}

function TwoColumnBoxes({
  leftTitle,
  leftBody,
  rightTitle,
  rightBody,
}: {
  leftTitle: ReactNode;
  leftBody: ReactNode;
  rightTitle: ReactNode;
  rightBody: ReactNode;
}) {
  return (
    <div style={twoColGrid}>
      <BoxedParagraph title={leftTitle}>{leftBody}</BoxedParagraph>
      <BoxedParagraph title={rightTitle}>{rightBody}</BoxedParagraph>
    </div>
  );
}

function CheckboxTable({
  leftHeader,
  rightHeader,
  left,
  right,
  namePrefix = "checklist",
  sections,
}: {
  leftHeader?: ReactNode;
  rightHeader?: ReactNode;
  left: ReactNode[];
  right: ReactNode[];
  namePrefix?: string;
  sections?: StringMap;
}) {
  const rows = Math.max(left.length, right.length);
  const saved = (key: string) => defaultSectionText(sections ?? {}, key, "");
  return (
    <div className="lift-pack-table-wrap"><table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>{leftHeader ?? "PRE-LIFT CHECK POINTS"}</th>
          <th style={thStyle}>Y</th>
          <th style={thStyle}>N</th>
          <th style={thStyle}>{rightHeader ?? "ERECTION / COMPLETION CHECKS"}</th>
          <th style={thStyle}>Y</th>
          <th style={thStyle}>N</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            <td style={tdStyle}>{left[i] ?? ""}</td>
            <td style={tickCell}>{<EditableInput name={`${namePrefix}_left_${i + 1}_yes`} defaultValue={saved(`${namePrefix}_left_${i + 1}_yes`)} align="right" emptyPrintValue="" />}</td>
            <td style={tickCell}>{<EditableInput name={`${namePrefix}_left_${i + 1}_no`} defaultValue={saved(`${namePrefix}_left_${i + 1}_no`)} align="right" emptyPrintValue="" />}</td>
            <td style={tdStyle}>{right[i] ?? ""}</td>
            <td style={tickCell}>{<EditableInput name={`${namePrefix}_right_${i + 1}_yes`} defaultValue={saved(`${namePrefix}_right_${i + 1}_yes`)} align="right" emptyPrintValue="" />}</td>
            <td style={tickCell}>{<EditableInput name={`${namePrefix}_right_${i + 1}_no`} defaultValue={saved(`${namePrefix}_right_${i + 1}_no`)} align="right" emptyPrintValue="" />}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function BlankTable({
  headers,
  rows,
  namePrefix = "blank_table",
  sections,
}: {
  headers: ReactNode[];
  rows: number;
  namePrefix?: string;
  sections?: StringMap;
}) {
  const saved = (key: string) => defaultSectionText(sections ?? {}, key, "");
  return (
    <div className="lift-pack-table-wrap"><table style={tableStyle}>
      <thead>
        <tr>
          {headers.map((header, index) => (
            <th key={index} style={thStyle}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            {headers.map((_, idx) => (
              <td key={idx} style={tdStyle}>
                {<EditableInput name={`${namePrefix}_r${i + 1}_c${idx + 1}`} defaultValue={saved(`${namePrefix}_r${i + 1}_c${idx + 1}`)} emptyPrintValue="" />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function SignatureRow({
  title,
  name,
  nameField,
  dateField,
  sections,
}: {
  title: ReactNode;
  name?: string | null;
  nameField: string;
  dateField: string;
  sections?: StringMap;
}) {
  const savedName = defaultSectionText(sections ?? {}, nameField, name || "");
  const savedDate = defaultSectionText(sections ?? {}, dateField, "");
  return (
    <div style={signatureBox}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 12, borderBottom: "1px solid #333", minHeight: 22 }} />
      <div style={{ marginTop: 6, fontSize: 12, display: "grid", gap: 4 }}>
        <div>Name: {<EditableInput name={nameField} defaultValue={savedName} />}</div>
        <div>Date: {<EditableInput name={dateField} defaultValue={savedDate} emptyPrintValue="" />}</div>
      </div>
    </div>
  );
}

function AppendixPage({
  asset,
  index,
  titleNode,
  captionNode,
  headerMonth,
  headerTitle,
  headerSubtitle,
  footerText,
}: {
  asset: PackAppendixAssetItem;
  index: number;
  titleNode?: ReactNode;
  captionNode?: ReactNode;
  headerMonth?: ReactNode;
  headerTitle?: ReactNode;
  headerSubtitle?: ReactNode;
  footerText?: ReactNode;
}) {
  const imageSrc = asset.image_url;

  return (
    <section
      className="lift-pack-page"
      style={{
        ...appendixPageStyle,
        pageBreakBefore: "always",
        breakBefore: "page",
        pageBreakAfter: "always",
        breakAfter: "page",
      }}
    >
      <PageHeader sectionTitle={`Appendix ${index}`} title={headerTitle} subtitle={headerSubtitle} month={headerMonth} />
      <div style={appendixPageBody}>
        <div style={appendixTitle}>{titleNode ?? asset.title}</div>
        {captionNode ? (
          <div style={appendixDescription}>{captionNode}</div>
        ) : asset.description ? (
          <div style={appendixDescription}>{asset.description}</div>
        ) : null}
        <div style={appendixFrame}>
          <img src={imageSrc} alt={typeof asset.title === "string" ? asset.title : `Appendix ${index}`} style={appendixImage} />
        </div>
      </div>
      <PageFooter text={footerText} />
    </section>
  );
}



function defaultSectionText(
  sections: StringMap,
  key: keyof StringMap,
  fallback: string
) {
  const value = sections[key];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function EditableInput({
  name,
  defaultValue,
  align = "left",
  emptyPrintValue = "—",
}: {
  name: string;
  defaultValue: string;
  align?: "left" | "right";
  emptyPrintValue?: string;
}) {
  const printValue = defaultValue && String(defaultValue).trim() ? defaultValue : emptyPrintValue;

  return (
    <span className="editable-value-wrap" style={editableValueWrapStyle}>
      <input
        className="editable-control"
        name={name}
        defaultValue={defaultValue}
        spellCheck={false}
        style={{
          ...inlineInputStyle,
          textAlign: align,
        }}
      />
      <span
        className="print-value"
        style={{
          ...printValueStyle,
          textAlign: align,
        }}
      >
        {printValue}
      </span>
    </span>
  );
}

function EditableTextarea({
  name,
  defaultValue,
  rows = 4,
  compact = false,
}: {
  name: string;
  defaultValue: string;
  rows?: number;
  compact?: boolean;
}) {
  const printValue = defaultValue && String(defaultValue).trim() ? defaultValue : "—";

  return (
    <span className="editable-value-wrap" style={editableValueWrapStyle}>
      <textarea
        className="editable-control"
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        spellCheck={false}
        style={{
          ...inlineTextareaStyle,
          minHeight: compact ? undefined : rows * 22,
        }}
      />
      <span
        className="print-value print-value-multiline"
        style={printValueStyle}
      >
        {printValue}
      </span>
    </span>
  );
}

function isAppendixImageDocument(doc: any) {
  const mime = String(doc?.file_type ?? "").toLowerCase();
  const name = String(doc?.file_name ?? "").toLowerCase();
  const documentType = String(doc?.document_type ?? "").toLowerCase();

  return (
    mime.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif") ||
    documentType === "site_drawing" ||
    documentType === "photo"
  );
}

async function signedJobDocumentMap(paths: string[]) {
  const supabase = createSupabaseServerClient();
  if (!paths.length) return new Map<string, string>();

  const { data, error } = await supabase.storage
    .from("job-documents")
    .createSignedUrls(paths, 60 * 60);

  if (error || !data) return new Map<string, string>();

  const out = new Map<string, string>();
  for (const row of data) {
    if (row.path && row.signedUrl) {
      out.set(row.path, row.signedUrl);
    }
  }
  return out;
}

export default async function CraneLiftPlanPackPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { saved?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: job }, { data: liftPlan }, { data: jobDocuments }] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_date,
        start_date,
        end_date,
        start_time,
        end_time,
        site_name,
        site_address,
        contact_name,
        contact_phone,
        hire_type,
        lift_type,
        notes,
        clients:client_id (
          company_name
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
      .single(),
    supabase.from("lift_plans").select("*").eq("job_id", params.id).maybeSingle(),
    supabase
      .from("job_documents")
      .select("id, file_name, file_path, file_type, document_type, created_at")
      .eq("job_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  const sections: StringMap =
    ((liftPlan as any)?.pack_sections as Record<string, string | null> | null) ?? {};
  const client = flatten((job as any)?.clients)[0] ?? null;
  const selectedJob = {
    ...(job as any),
    selected_job_equipment_id: (liftPlan as any)?.selected_job_equipment_id ?? null,
    selected_crane_id: (liftPlan as any)?.selected_crane_id ?? null,
  };
  const primary = getPrimaryCraneContext(selectedJob);
  const crane = primary?.crane ?? flatten((job as any)?.cranes)[0] ?? null;
  const allocation = primary?.allocation ?? null;
  const operator =
    primary?.operator ??
    flatten((job as any)?.main_operator)[0] ??
    flatten((job as any)?.operators)[0] ??
    null;

  const equipmentProfile = matchCraneJobEquipmentProfile({
    ...selectedJob,
    cranes: crane ? [crane] : flatten((job as any)?.cranes),
    job_equipment: (job as any)?.job_equipment ?? [],
  });

  const craneAppendixAssets = await getCraneAppendixAssetsForPack(primary?.crane?.id ?? crane?.id ?? null);
  const appendixImageDocs = ((jobDocuments as any[]) ?? []).filter(isAppendixImageDocument);
  const signedJobDocs = await signedJobDocumentMap(
    appendixImageDocs.map((doc: any) => String(doc?.file_path ?? "")).filter(Boolean)
  );
  const jobAppendixAssets: PackAppendixAssetItem[] = appendixImageDocs
    .map((doc: any) => {
      const imageUrl = signedJobDocs.get(String(doc?.file_path ?? ""));
      if (!imageUrl) return null;
      return {
        title: doc?.file_name || "Uploaded appendix",
        description: String(doc?.document_type ?? "").split("_").join(" "),
        image_url: imageUrl,
        page_number: null,
      } as PackAppendixAssetItem;
    })
    .filter(Boolean) as PackAppendixAssetItem[];
  const appendixAssets = [...craneAppendixAssets, ...jobAppendixAssets];

  const clientName = client?.company_name || "the client";
  const printTitle = [
    client?.company_name || "Customer",
    "Lift Plan Pack",
    (job as any)?.job_number ? `Job ${(job as any).job_number}` : null,
  ].filter(Boolean).join(" - ");
  const projectName =
    sections.cover_project ||
    (job as any)?.site_name ||
    `Job ${(job as any)?.job_number ?? ""}`.trim();
  const appointedPerson = liftPlan?.appointed_person || liftPlan?.approved_by || "Shaun Robinson";
  const liftSupervisor = liftPlan?.lift_supervisor || appointedPerson;
  const craneName = craneLabel(crane, allocation);
  const craneCapacity = formatCapacity(equipmentProfile, crane);
  const loadWeight = liftPlan?.load_weight ? `${liftPlan.load_weight} kg` : "—";
  const boomConfig = shortBoomConfiguration(
    sections.boom_configuration,
    liftPlan?.crane_configuration,
    equipmentProfile
  );
  const boomLength = shortBoomLength(sections.boom_length, equipmentProfile, craneName);
  const utilisation = percentageUtilisation(liftPlan?.load_weight, equipmentProfile?.maxCapacityKg);
  const craneMaxWeightKg = parseWeightToKg(sections.ground_bearing_crane_max_weight || sections.crane_gross_weight) ?? parseWeightToKg(equipmentProfile?.maxCapacityKg) ?? parseWeightToKg(crane?.capacity);
  const loadMaxWeightKg = parseWeightToKg(sections.ground_bearing_load_max_weight || liftPlan?.load_weight);
  const combinedMaxWeightKg = craneMaxWeightKg && loadMaxWeightKg ? craneMaxWeightKg + loadMaxWeightKg : null;
  const estimatedGroundBearingKg = combinedMaxWeightKg ? combinedMaxWeightKg * 0.75 : null;
  const scopeFallback = fallbackScope(clientName, projectName, liftPlan, loadWeight);
  const communicationFallback = fallbackCommunication((job as any)?.contact_name || "");
  const methodStatementLines = splitLines(liftPlan?.method_statement);
  const riskLines = splitLines(liftPlan?.risk_assessment);
  const hazardLines = splitLines(liftPlan?.site_hazards);
  const controlLines = splitLines(liftPlan?.control_measures);
  const ppeLines = splitLines(liftPlan?.ppe_required);
  const emergencyContacts = splitLines(sections.emergency_contacts || "").join("\n");
  const equipmentList = splitLines(sections.equipment_list || "").join("\n");
  const toolboxNotes = splitLines(sections.toolbox_notes || "").join("\n");

  const coverProjectText = defaultSectionText(
    sections,
    "cover_project",
    (job as any)?.site_name || `Job ${(job as any)?.job_number ?? ""}`.trim()
  );
  const liftClassificationText = defaultSectionText(
    sections,
    "lift_classification",
    (job as any)?.hire_type || "Basic"
  );
  const boomConfigurationText = defaultSectionText(sections, "boom_configuration", boomConfig);
  const boomLengthText = defaultSectionText(sections, "boom_length", boomLength);
  const introductionText = defaultSectionText(
    sections,
    "introduction",
    `This Method Statement has been prepared using information provided by ${clientName}, together with the site-specific details and lifting information recorded within the CRM. The operation is to be carried out in accordance with the approved lifting plan, current legislation, BS 7121, LOLER, PUWER and the relevant manufacturer guidance for the selected crane.`
  );
  const clientResponsibilitiesText = defaultSectionText(
    sections,
    "client_responsibilities",
    `The client shall provide accurate load information, safe and suitable access, a suitable crane standing area, traffic and pedestrian controls where required, and details of any restrictions, underground services, permits or other site conditions that may affect the lifting operation. The client remains responsible for the structural integrity of the load and any client-supplied lifting points.`
  );
  const contractLiftArrivalText = defaultSectionText(
    sections,
    "contract_lift_arrival",
    `Upon arrival, the crane and lifting personnel will report to the agreed site contact, complete any required induction and proceed to the planned lifting position under supervision. No lifting activity will commence until the Lift Supervisor has confirmed that the crane is correctly positioned, the exclusion zone is in place, communication is agreed, and the site remains suitable for the planned operation.`
  );
  const scopeOfWorksText = defaultSectionText(
    sections,
    "scope_of_works",
    sections.scope_of_works || liftPlan?.load_description || scopeFallback
  );
  const communicationText = defaultSectionText(
    sections,
    "communication",
    communicationFallback
  );
  const weatherConditionsText = defaultSectionText(
    sections,
    "weather_conditions",
    sections.weather_conditions || liftPlan?.weather_limitations || equipmentProfile?.weatherNote || `Lifting operations must not proceed in unsafe wind, lightning, heavy rain or poor visibility. Final permissible wind speed is to be confirmed against the relevant crane chart, selected configuration, load characteristics and the prevailing site conditions before the lift proceeds.`
  );
  const siteAccessText = defaultSectionText(
    sections,
    "site_access_egress",
    `The client must ensure that the crane, support vehicles and lifting personnel have clear and safe access to and egress from the site at all times. Access routes must remain suitable for the crane size, weight and turning requirements.`
  );
  const groundConditionsText = defaultSectionText(
    sections,
    "ground_conditions",
    sections.ground_conditions || liftPlan?.ground_conditions || `Ground conditions are to be confirmed on arrival. The crane must only be set up on firm, level ground capable of supporting the crane, the load and the outrigger reactions. Additional ground protection must be used where required.`
  );
  const overheadText = defaultSectionText(
    sections,
    "overhead_obstructions",
    sections.overhead_obstructions || liftPlan?.site_hazards || `All overhead obstructions, structures, plant, services and slewing restrictions must be identified and controlled before lifting operations commence.`
  );
  const trafficText = defaultSectionText(
    sections,
    "traffic_pedestrian_management",
    sections.traffic_pedestrian_management || liftPlan?.exclusion_zone_details || `The lifting area is to be clearly cordoned off using barriers and signage. Only authorised personnel are permitted within the lifting zone during operations.`
  );
  const liftingEquipmentText = defaultSectionText(
    sections,
    "lifting_equipment_certification",
    sections.lifting_equipment_certification || "All lifting tackle must hold current certification and be inspected before use."
  );
  const craneDetailsText = defaultSectionText(
    sections,
    "crane_details",
    equipmentProfile?.summary || "Selected crane profile to be checked against the current manufacturer specification and load chart."
  );
  const craneSetupText = defaultSectionText(
    sections,
    "crane_setup_procedure",
    sections.crane_setup_procedure || liftPlan?.crane_configuration || equipmentProfile?.configurationNote || `The crane is to be rigged and configured in accordance with the manufacturer’s instructions, the selected chart and the approved lift arrangement.`
  );
  const liftingProcedureText = defaultSectionText(
    sections,
    "lifting_procedure",
    sections.lifting_procedure ||
      (methodStatementLines.length
        ? methodStatementLines.join("\n")
        : "1. Brief all personnel and confirm communication method.\n2. Establish exclusion zone and position the crane.\n3. Inspect lifting accessories and connect as planned.\n4. Take up slack and complete a controlled test lift.\n5. Hoist, slew and land the load under the direction of the designated signaller.\n6. Remove lifting accessories and prepare for the next operation.")
  );
  const deRigText = defaultSectionText(
    sections,
    "de_rig_procedure",
    `On completion of the lifting operation, the crane operator and lifting team will remove lifting accessories, de-rig the crane in accordance with the manufacturer’s instructions, recover mats and barriers, and leave the site in a safe and tidy condition.`
  );
  const emergencyProcedureText = defaultSectionText(
    sections,
    "emergency_procedure",
    sections.emergency_procedure || liftPlan?.emergency_procedures || `In the event of an emergency, lifting operations are to stop immediately. The load must be made safe where possible, the exclusion zone maintained, and the site emergency procedures followed. No lifting operation is to recommence until the situation has been resolved and the area declared safe.`
  );
  const riskSummaryText = defaultSectionText(
    sections,
    "risk_assessment_summary",
    sections.risk_assessment_summary ||
      (riskLines.length
        ? riskLines.join("\n")
        : "Key risks include load drop, crane instability, collision with structures or persons, communication failure, ground failure, adverse weather and unauthorised access to the lifting zone.")
  );
  const emergencyContactsText = defaultSectionText(sections, "emergency_contacts", emergencyContacts);
  const equipmentListText = defaultSectionText(sections, "equipment_list", equipmentList);
  const toolboxNotesText = defaultSectionText(sections, "toolbox_notes", toolboxNotes);

  const jobPlanningSnapshotText = defaultSectionText(
    sections,
    "job_planning_snapshot_text",
    [
      `Client: ${clientName}`,
      `Project: ${coverProjectText}`,
      `Crane: ${craneName}`,
      `Lift Type: ${(job as any)?.lift_type || "—"}`,
      `Site Contact: ${(job as any)?.contact_name || "—"}`,
      `Job Notes: ${(job as any)?.notes || "—"}`,
    ].join("\n")
  );

  const packMonthLabel = fmtMonthYear((job as any)?.start_date ?? (job as any)?.job_date ?? new Date());
  const fieldText = (key: string, fallback: string) => defaultSectionText(sections, key, fallback);
  const packMonthText = (key: string) => {
    const saved = defaultSectionText(sections, key, "");
    if (!saved || saved === "April 2026") return packMonthLabel;
    return saved;
  };
  const inputField = (key: string, fallback: string, align: "left" | "right" = "left") => (
    <EditableInput name={key} defaultValue={fieldText(key, fallback)} align={align} />
  );
  const monthInputField = (key: string, align: "left" | "right" = "left") => (
    <EditableInput name={key} defaultValue={packMonthText(key)} align={align} />
  );
  const areaField = (key: string, fallback: string, rows = 4, compact = false) => (
    <EditableTextarea name={key} defaultValue={fieldText(key, fallback)} rows={rows} compact={compact} />
  );

  const saveOk = String(searchParams?.saved ?? "") === "1";
  const saveError = String(searchParams?.error ?? "").trim();
  const isLocked = Boolean((liftPlan as any)?.paperwork_locked);

  const outreachRef = formatOutreachReference(equipmentProfile);
  const jibRef = formatJibReference(equipmentProfile);

  return (
    <div className="print-document-root" style={wrapper}>
      <style>{`
        @media screen and (max-width: 760px) {
          .lift-pack-page {
            width: 100% !important;
            min-height: auto !important;
            padding: 14px !important;
            margin: 0 auto 14px auto !important;
          }

          .lift-pack-table-wrap {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .lift-pack-table-wrap table {
            min-width: 620px;
          }
        }

        @media print {
          @page { size: A4; margin: 0; }

          html, body {
            background: white !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-hide { display: none !important; }

          .print-document-root {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .lift-pack-page {
            width: 190mm !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 auto !important;
            padding: 10mm 5mm 8mm 5mm !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: always !important;
            break-after: page !important;
            overflow: visible !important;
          }

          .lift-pack-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .editable-control {
            display: none !important;
          }

          .print-value {
            display: block !important;
            width: 100% !important;
            min-height: 0 !important;
            white-space: normal !important;
            overflow: visible !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            font: inherit !important;
            color: #111 !important;
          }

          .print-value-multiline {
            white-space: pre-wrap !important;
            line-height: 1.38 !important;
          }

          .lift-pack-table-wrap { overflow: visible !important; }
          .lift-pack-table-wrap table { min-width: 0 !important; }
        }
      `}</style>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("input", function (event) {
              var target = event.target;
              if (!target || !target.name) return;
              var fields = document.getElementsByName(target.name);
              for (var i = 0; i < fields.length; i += 1) {
                var field = fields[i];
                if (field !== target && "value" in field) {
                  field.value = target.value;
                }
              }
            });
          `,
        }}
      />

      <form action={`/api/jobs/${params.id}/lift-plan/pack-selections`} method="post">
        <div className="print-hide" style={toolbar}>
          <a href={`/jobs/${params.id}/lift-plan`} style={buttonStyle}>
            ← Back to lift plan
          </a>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="submit" style={isLocked ? { ...saveButtonStyle, opacity: 0.55, cursor: "not-allowed" } : saveButtonStyle} disabled={isLocked}>
              {isLocked ? "Lift plan locked" : "Save pack edits"}
            </button>
            <PrintPackButton printTitle={printTitle} />
          </div>
        </div>

        {isLocked ? (
          <div className="print-hide" style={lockedBannerStyle}>
            This lift plan is locked. Pack fields are read-only on this page until the lock is removed.
          </div>
        ) : null}
        {saveOk ? <div className="print-hide" style={saveOkStyle}>Pack edits saved.</div> : null}
        {saveError ? <div className="print-hide" style={saveErrorStyle}>{saveError}</div> : null}

      <fieldset disabled={isLocked} style={fieldsetStyle}>
      <PageShell
        sectionTitle={inputField("page_section_cover", "Cover Sheet", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <div style={coverHero}>
          <div>
            <div style={coverTitle}>{inputField("cover_title", "ANNS – LIFTING PLAN – V1")}</div>
            <div style={coverSubtitle}>{monthInputField("cover_subtitle")}</div>
          </div>
          <div style={coverCompany}>
            <div>{inputField("cover_company_line_1", "Anns Crane Hire Ltd", "right")}</div>
            <div>{inputField("cover_company_line_2", "6 Bay St, Port Tennant, Swansea, SA1 8LB", "right")}</div>
            <div>{inputField("cover_company_line_3", "01792 641653 • info@annscranehire.co.uk", "right")}</div>
          </div>
        </div>

        <InfoTable
          rows={[
            [inputField("cover_label_client", "Client"), inputField("cover_client", clientName)],
            [inputField("cover_label_project", "Project"), inputField("cover_project", coverProjectText)],
            [
              inputField("cover_label_start_date", "Start Date"),
              inputField("cover_start_date", fmtDate((job as any)?.start_date ?? (job as any)?.job_date)),
            ],
            [
              inputField("cover_label_duration", "Duration"),
              inputField(
                "cover_duration",
                calcDuration(
                  (job as any)?.start_date ?? (job as any)?.job_date,
                  (job as any)?.end_date ?? (job as any)?.job_date
                )
              ),
            ],
            [inputField("cover_label_site_address", "Site Address"), areaField("cover_site_address", coverAddress(job), 2, true)],
            [inputField("cover_label_site_contact", "Site Contact"), inputField("cover_site_contact", (job as any)?.contact_name || "—")],
            [inputField("cover_label_appointed_person", "Appointed Person"), inputField("cover_appointed_person", appointedPerson)],
            [inputField("cover_label_prepared_by", "Prepared by"), inputField("cover_prepared_by_value", "ANNS CRANE HIRE LTD")],
            [
              inputField("cover_label_lift_classification", "Lift Classification"),
              inputField("lift_classification", liftClassificationText),
            ],
            [inputField("cover_label_cranes", "Crane(s)"), inputField("cover_cranes", craneName)],
            [inputField("cover_label_boom_configuration", "Boom configuration"), areaField("boom_configuration", boomConfigurationText, 3, true)],
            [inputField("cover_label_boom_length", "Boom length"), inputField("boom_length", boomLengthText)],
          ]}
        />
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_toc", "Table of Contents", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("toc_title", "Table of Contents")}</SectionTitle>
        <div style={tocGrid}>
          {[
            ["toc_item_1", "1. Introduction"],
            ["toc_item_2", "2. Appointed Person Declaration"],
            ["toc_item_3", "3. Client Responsibilities and General Conditions"],
            ["toc_item_4", "4. The Contract Lift and Arrival on Site"],
            ["toc_item_5", "5. Brief Scope of Works"],
            ["toc_item_6", "6. Lifting Personnel"],
            ["toc_item_7", "7. On Site Communication"],
            ["toc_item_8", "8. Weather Conditions"],
            ["toc_item_9", "9. Site Access and Egress"],
            ["toc_item_10", "10. Ground Conditions"],
            ["toc_item_11", "11. Overhead Obstructions and Slewing Restrictions"],
            ["toc_item_12", "12. Traffic and Pedestrian Management"],
            ["toc_item_13", "13. Lifting Equipment to be used & Certification"],
            ["toc_item_14", "14. Crane Details"],
            ["toc_item_15", "15. Variation from Method Statement"],
            ["toc_item_16", "16. Toolbox Talk Attendance"],
            ["toc_item_17", "17. Crane Set-up Procedure"],
            ["toc_item_18", "18. Lifting Procedure"],
            ["toc_item_19", "19. De-Rig Procedure"],
            ["toc_item_20", "20. Emergency Procedure"],
            ["toc_item_21", "21. Risk Assessments"],
            ["toc_item_22", "22. Check Lists and Sign Offs"],
          ].map(([key, item]) => (
            <div key={String(key)} style={tocItem}>
              {inputField(String(key), String(item))}
            </div>
          ))}
          {appendixAssets.length ? (
            <div style={tocItem}>{inputField("toc_item_appendix", "Appendix – Selected machine specification and chart pages")}</div>
          ) : null}
        </div>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_1", "1. Introduction", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_1", "1. Introduction")}</SectionTitle>
        <BoxedParagraph title={inputField("method_statement_title", "Method Statement – CPA Contract Lift")}>
          {<EditableTextarea name="introduction" defaultValue={introductionText} rows={8} />}
        </BoxedParagraph>

        <TwoColumnBoxes
          leftTitle={inputField("site_inspection_title", "Site Inspection")}
          leftBody={areaField("site_inspection_text", `A pre-lift planning review must confirm access and egress, crane standing area, ground conditions, exclusion zones, overhead obstructions, public interface, delivery positions and any site-specific restrictions before lifting operations commence.`, 8)}
          rightTitle={inputField("roles_responsibilities_title", "Roles and Responsibilities")}
          rightBody={areaField("roles_responsibilities_text", `The Appointed Person is responsible for the lift planning. The Lift Supervisor is responsible for implementing the plan on site. The Slinger/Signaller is responsible for directing the lift and ensuring correct attachment of lifting accessories. The crane operator must only operate within the approved configuration and under the agreed signalling method.`, 8)}
        />

        <BoxedParagraph title={inputField("job_planning_snapshot_title", "Job Planning Snapshot")} compact>
          {areaField("job_planning_snapshot_text", jobPlanningSnapshotText, 7, true)}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_2_5", "2–5. Planning & Scope", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_2", "2. Appointed Person Declaration")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("ap_decl_label_name", "Name"), inputField("ap_decl_name", appointedPerson)],
            [inputField("ap_decl_label_prepared_for", "Prepared for job"), inputField("ap_decl_prepared_for_job", `#${(job as any)?.job_number ?? "—"}`)],
            [inputField("cover_label_prepared_by", "Prepared by"), inputField("cover_prepared_by_value", "ANNS CRANE HIRE LTD")],
            [inputField("ap_decl_label_approved_by", "Approved by"), inputField("ap_decl_approved_by_value", liftPlan?.approved_by || "—")],
            [inputField("ap_decl_label_approved_at", "Approved at"), inputField("ap_decl_approved_at_value", fmtDateTime(liftPlan?.approved_at))],
          ]}
        />

        <SectionTitle>{inputField("section_title_3", "3. Client Responsibilities and General Conditions")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="client_responsibilities" defaultValue={clientResponsibilitiesText} rows={8} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_4", "4. The Contract Lift and Arrival on Site")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="contract_lift_arrival" defaultValue={contractLiftArrivalText} rows={8} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_5", "5. Brief Scope of Works")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="scope_of_works" defaultValue={scopeOfWorksText} rows={8} />}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_6_12", "6–12. Site Controls", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_6", "6. Lifting Personnel")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("cover_label_appointed_person", "Appointed Person"), inputField("personnel_appointed_person", appointedPerson)],
            [inputField("personnel_label_ls", "Lift Supervisor"), inputField("personnel_lift_supervisor", liftSupervisor)],
            [inputField("personnel_label_operator", "Crane Operator"), inputField("personnel_crane_operator", liftPlan?.crane_operator || operator?.full_name || "—")],
            [inputField("personnel_label_client_contact", "Client / Site Contact"), inputField("personnel_client_contact", (job as any)?.contact_name || "—")],
          ]}
        />

        <SectionTitle>{inputField("section_title_7", "7. On Site Communication")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="communication" defaultValue={communicationText} rows={6} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_8", "8. Weather Conditions")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="weather_conditions" defaultValue={weatherConditionsText} rows={6} />}
        </BoxedParagraph>

        <TwoColumnBoxes
          leftTitle={inputField("section_title_9", "9. Site Access and Egress")}
          leftBody={<EditableTextarea name="site_access_egress" defaultValue={siteAccessText} rows={6} />}
          rightTitle={inputField("section_title_10", "10. Ground Conditions")}
          rightBody={<EditableTextarea name="ground_conditions" defaultValue={groundConditionsText} rows={6} />}
        />

        <TwoColumnBoxes
          leftTitle={inputField("section_title_11", "11. Overhead Obstructions and Slewing Restrictions")}
          leftBody={<EditableTextarea name="overhead_obstructions" defaultValue={overheadText} rows={6} />}
          rightTitle={inputField("section_title_12", "12. Traffic and Pedestrian Management")}
          rightBody={<EditableTextarea name="traffic_pedestrian_management" defaultValue={trafficText} rows={6} />}
        />
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_13", "13. Equipment & Certification", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_13", "13. Lifting Equipment to be used & Certification")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("equipment_label_sling_type", "Sling type"), inputField("equipment_sling_type", liftPlan?.sling_type || "—")],
            [inputField("equipment_label_lifting_accessories", "Lifting accessories"), areaField("equipment_lifting_accessories", liftPlan?.lifting_accessories || "—", 3, true)],
            [
              inputField("equipment_label_loler", "LOLER / certification"),
              <EditableTextarea name="lifting_equipment_certification" defaultValue={liftingEquipmentText} rows={4} compact />,
            ],
          ]}
        />
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_14", "14. Crane Details", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_14", "14. Crane Details")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("crane_label_type", "Crane type"), inputField("crane_type_value", craneName)],
            [
              inputField("crane_label_gross_weight", "Crane gross weight"),
              inputField("crane_gross_weight", crane?.capacity ? `${crane?.capacity}` : "See selected machine profile / manufacturer information"),
            ],
            [inputField("crane_label_load_weight", "Gross weight of load"), inputField("crane_load_weight", loadWeight)],
            [
              inputField("crane_label_lifting_accessories_weight", "Gross weight of lifting accessories"),
              inputField("crane_lifting_accessories_weight_text", liftPlan?.lifting_accessories ? "Included within planned lift accessories." : "—"),
            ],
            [inputField("cover_label_boom_configuration", "Boom configuration"), <EditableTextarea name="boom_configuration" defaultValue={boomConfigurationText} rows={3} compact />],
            [inputField("crane_label_outreach_reference", "Boom / outreach reference"), inputField("crane_outreach_reference", outreachRef)],
            [inputField("crane_label_jib_reference", "Jib / max outreach"), inputField("crane_jib_reference", jibRef)],
            [inputField("crane_label_max_capacity", "Max capacity"), inputField("crane_max_capacity", craneCapacity)],
            [inputField("crane_label_utilisation", "Crane utilisation %"), inputField("crane_utilisation", utilisation)],
          ]}
        />

        <BoxedParagraph title={inputField("ground_bearing_title", "Ground bearing load calculation")}>
          <InfoTable
            rows={[
              [inputField("ground_bearing_label_crane_max", "Max weight / capacity of crane used"), inputField("ground_bearing_crane_max_weight", formatKgAndTonnes(craneMaxWeightKg))],
              [inputField("ground_bearing_label_load_max", "Max weight of load"), inputField("ground_bearing_load_max_weight", formatKgAndTonnes(loadMaxWeightKg))],
              [inputField("ground_bearing_label_combined", "Combined max weight"), inputField("ground_bearing_combined_weight", formatKgAndTonnes(combinedMaxWeightKg))],
              [inputField("ground_bearing_label_factor", "Calculation factor"), inputField("ground_bearing_factor", "0.75")],
              [inputField("ground_bearing_label_result", "Estimated ground bearing / outrigger load"), inputField("ground_bearing_result", formatKgAndTonnes(estimatedGroundBearingKg))],
            ]}
          />
          <div style={{ marginTop: 8 }}>
            {areaField("ground_bearing_notes", "Calculation used: (max weight / capacity of crane + max weight of load) × 0.75. This is for the lift plan calculation table only; final ground bearing pressures, mat/spreader requirements and outrigger reactions must be confirmed against the actual crane chart, outrigger setup and ground conditions before lifting.", 4, true)}
          </div>
        </BoxedParagraph>

        <BoxedParagraph title={inputField("crane_specifications_title", "Crane specifications")}>
          {<EditableTextarea name="crane_details" defaultValue={craneDetailsText} rows={8} />}
        </BoxedParagraph>

        <BoxedParagraph title={inputField("configuration_outrigger_title", "Configuration / outrigger note")}>
          {areaField("configuration_outrigger_note", `${equipmentProfile?.configurationNote || "The crane is to be configured and rigged only in the arrangement approved for the planned lift."}

${equipmentProfile?.outriggersNote || "Outriggers are to be deployed as required by the selected duty and site restrictions on suitable support mats / spreaders."}`, 7)}
        </BoxedParagraph>

        <BoxedParagraph title={inputField("load_chart_note_title", "Load chart note")}>
          {areaField("load_chart_note", "Final radius, boom length, hook block weight, accessories, outrigger arrangement, ground conditions and any partial set-up restrictions must be checked against the current applicable chart before the lift proceeds.", 5)}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_15_16", "15–16. Variation & Toolbox", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_15", "15. Variation from Method Statement")}</SectionTitle>
        <BlankTable
          headers={[
            inputField("variation_header_1", "Variation Details"),
            inputField("variation_header_2", "Time / Date"),
            inputField("variation_header_3", "AP Contact"),
            inputField("variation_header_4", "Initials"),
          ]}
          rows={5}
          namePrefix="variation_table"
          sections={sections}
        />

        <div style={avoidBreak}>
          <SectionTitle>{inputField("section_title_16", "16. Toolbox Talk Attendance")}</SectionTitle>
          <CheckboxTable
            leftHeader={inputField("checklist_left_header", "PRE-LIFT CHECK POINTS")}
            rightHeader={inputField("checklist_right_header", "ERECTION / COMPLETION CHECKS")}
            left={[
              inputField("check_left_1", "Crane test certificates"),
              inputField("check_left_2", "Crane thorough examination report"),
              inputField("check_left_3", "Operator weekly inspection form"),
              inputField("check_left_4", "Test certificates / thorough exam reports for lifting accessories"),
              inputField("check_left_5", "Toolbox talk delivered and recorded"),
              inputField("check_left_6", "Appropriate PPE"),
            ]}
            right={[
              inputField("check_right_1", "Working area cordoned off"),
              inputField("check_right_2", "Crane set in correct location"),
              inputField("check_right_3", "Crane limits & load indicator OK"),
              inputField("check_right_4", "Rigging fitted as detailed"),
              inputField("check_right_5", "Weather within acceptable limits"),
              inputField("check_right_6", "Site cleared"),
            ]}
            namePrefix="toolbox_checklist"
            sections={sections}
          />
        </div>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_17", "17. Crane Set-up Procedure", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_17", "17. Crane Set-up Procedure")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="crane_setup_procedure" defaultValue={craneSetupText} rows={7} />}
        </BoxedParagraph>
        <BoxedParagraph title={inputField("outrigger_setup_note_title", "Outrigger / set-up note")} compact>
          {areaField("outrigger_setup_note", sentenceCase(
            liftPlan?.outrigger_setup || equipmentProfile?.outriggersNote,
            `Outriggers are to be deployed as required by the selected configuration and the site restrictions. Suitable mats / spreaders are to be used where necessary.`
          ), 4, true)}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_18_19", "18–19. Lifting & De-Rig Procedure", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_18", "18. Lifting Procedure")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="lifting_procedure" defaultValue={liftingProcedureText} rows={10} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_19", "19. De-Rig Procedure")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="de_rig_procedure" defaultValue={deRigText} rows={7} />}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_20_21", "20–21. Emergency & Risk", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_20", "20. Emergency Procedure")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="emergency_procedure" defaultValue={emergencyProcedureText} rows={7} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_21", "21. Risk Assessments")}</SectionTitle>
        <TwoColumnBoxes
          leftTitle={inputField("risk_assessment_summary_title", "Risk assessment summary")}
          leftBody={
            <EditableTextarea name="risk_assessment_summary" defaultValue={riskSummaryText} rows={9} />
          }
          rightTitle={inputField("site_hazards_title", "Site hazards")}
          rightBody={
            areaField("site_hazards", hazardLines.length
              ? hazardLines.join("\n")
              : "Overhead obstructions, restricted access, uneven ground, adjacent traffic, and any site-specific hazards identified at planning stage or on arrival.", 9)
          }
        />

        <TwoColumnBoxes
          leftTitle={inputField("control_measures_title", "Control measures")}
          leftBody={
            areaField("control_measures", controlLines.length
              ? controlLines.join("\n")
              : "Establish exclusion zone, use competent personnel, inspect equipment, monitor weather, maintain communication, and follow the approved lift plan and manufacturer guidance.", 9)
          }
          rightTitle={inputField("ppe_required_title", "PPE required")}
          rightBody={
            areaField("ppe_required", ppeLines.length
              ? ppeLines.join("\n")
              : "Hard hat, hi-vis clothing, safety footwear, gloves and any additional PPE required for the specific load / site conditions.", 9)
          }
        />
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_22", "22. Check Lists & Sign Offs", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_22", "22. Check Lists and Sign Offs")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("signoff_label_lift_plan_complete", "Lift plan complete"), inputField("signoff_lift_plan_complete", yesNo(liftPlan?.lift_plan_complete))],
            [inputField("signoff_label_rams_complete", "RAMS complete"), inputField("signoff_rams_complete", yesNo(liftPlan?.rams_complete))],
            [inputField("ap_decl_label_approved_by", "Approved by"), inputField("ap_decl_approved_by_value", liftPlan?.approved_by || "—")],
            [inputField("ap_decl_label_approved_at", "Approved at"), inputField("ap_decl_approved_at_value", fmtDateTime(liftPlan?.approved_at))],
            [inputField("signoff_label_approval_notes", "Approval notes"), areaField("signoff_approval_notes", liftPlan?.approval_notes || "—", 3, true)],
          ]}
        />

        <div style={avoidBreak}>
          <div style={subHeading}>{inputField("attendance_record_title", "Attendance Record")}</div>
          <BlankTable headers={[inputField("attendance_header_1", "Name"), inputField("attendance_header_2", "Employer"), inputField("attendance_header_3", "Signature")]} rows={4} namePrefix="attendance_record" sections={sections} />
        </div>

        <div style={avoidBreak}>
          <div style={subHeading}>{inputField("delegation_title", "Delegation of Duties")}</div>
          <InfoTable
            rows={[
              [inputField("delegation_label_ap", "Appointed Person"), inputField("delegation_appointed_person", appointedPerson)],
              [inputField("delegation_label_ls", "Lift Supervisor"), inputField("delegation_lift_supervisor", liftSupervisor)],
              [inputField("delegation_label_operator", "Crane Operator"), inputField("delegation_crane_operator", liftPlan?.crane_operator || operator?.full_name || "—")],
            ]}
          />
        </div>

        <div style={signatureGrid}>
          <SignatureRow title={inputField("signature_title_ap", "Appointed Person signature")} name={appointedPerson} nameField="signature_ap_name" dateField="signature_ap_date" sections={sections} />
          <SignatureRow title={inputField("signature_title_ls", "Lift Supervisor signature")} name={liftSupervisor} nameField="signature_ls_name" dateField="signature_ls_date" sections={sections} />
          <SignatureRow title={inputField("signature_title_operator", "Crane Operator signature")} name={liftPlan?.crane_operator || operator?.full_name} nameField="signature_operator_name" dateField="signature_operator_date" sections={sections} />
          <SignatureRow title={inputField("signature_title_client", "Client completion sign-off")} name={(job as any)?.contact_name} nameField="signature_client_name" dateField="signature_client_date" sections={sections} />
        </div>

        <BoxedParagraph title={inputField("toolbox_notes_title", "Toolbox / sign-off notes")}>
          {<EditableTextarea name="toolbox_notes" defaultValue={toolboxNotesText} rows={6} />}
        </BoxedParagraph>

        <BoxedParagraph title={inputField("emergency_contacts_title", "Emergency contacts")}>
          {<EditableTextarea name="emergency_contacts" defaultValue={emergencyContactsText} rows={5} />}
        </BoxedParagraph>

        <BoxedParagraph title={inputField("equipment_list_title", "Equipment list")}>
          {<EditableTextarea name="equipment_list" defaultValue={equipmentListText} rows={5} />}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_wind", "Wind Speed Record Sheet", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
        breakAfter={true}
      >
        <SectionTitle>{inputField("section_title_wind", "Wind speed record sheet")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("wind_label_project", "Project"), <EditableInput name="cover_project" defaultValue={coverProjectText} />],
            [inputField("wind_label_lift_supervisor", "Lift Supervisor"), inputField("wind_lift_supervisor", liftSupervisor)],
            [inputField("wind_label_date", "Date"), inputField("wind_date", fmtDate((job as any)?.start_date ?? (job as any)?.job_date))],
          ]}
        />
        <div style={{ height: 8 }} />
        <BlankTable headers={[inputField("wind_header_1", "Time"), inputField("wind_header_2", "Wind Speed"), inputField("wind_header_3", "OK To Work (Y / N)"), inputField("wind_header_4", "Notes")]} rows={12} namePrefix="wind_record" sections={sections} />
      </PageShell>

      {appendixAssets.map((asset, index) => (
        <AppendixPage
          key={`${asset.title}-${asset.page_number}-${index}`}
          asset={asset}
          index={index + 1}
          titleNode={inputField(`appendix_${index + 1}_title`, asset.title || `Appendix ${index + 1}`)}
          captionNode={areaField(`appendix_${index + 1}_caption`, asset.description || "", 2, true)}
          headerMonth={monthInputField("page_header_month", "right")}
          headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
          headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
          footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
        />
      ))}
      </fieldset>
      </form>
    </div>
  );
}


const fieldsetStyle: CSSProperties = {
  border: 0,
  margin: 0,
  padding: 0,
  minInlineSize: "auto",
};

const lockedBannerStyle: CSSProperties = {
  margin: "0 0 16px",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(180,0,0,0.10)",
  border: "1px solid rgba(180,0,0,0.16)",
  color: "#8b0000",
  fontWeight: 700,
};

const wrapper: CSSProperties = {
  background: "#f5f5f5",
  color: "#111",
  minHeight: "100vh",
  padding: 24,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
};

const toolbar: CSSProperties = {
  maxWidth: "190mm",
  margin: "0 auto 16px auto",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const buttonStyle: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.95)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.12)",
};

const saveButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};

const saveOkStyle: CSSProperties = {
  width: "min(190mm, 100%)",
  margin: "0 auto 16px auto",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,160,80,0.12)",
  border: "1px solid rgba(0,160,80,0.18)",
  color: "#0b6b34",
  fontWeight: 700,
};

const saveErrorStyle: CSSProperties = {
  width: "min(190mm, 100%)",
  margin: "0 auto 16px auto",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.18)",
  color: "#8b0000",
  fontWeight: 700,
};

const editableValueWrapStyle: CSSProperties = {
  display: "block",
  width: "100%",
  minWidth: 0,
};

const printValueStyle: CSSProperties = {
  display: "none",
  width: "100%",
  minWidth: 0,
  font: "inherit",
  fontWeight: "inherit",
  color: "#111",
  overflowWrap: "anywhere",
  boxSizing: "border-box",
};

const inlineInputStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  font: "inherit",
  fontWeight: 600,
  color: "#111",
  outline: "none",
  boxSizing: "border-box",
  overflowWrap: "anywhere",
};

const inlineTextareaStyle: CSSProperties = {
  width: "100%",
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "#111",
  lineHeight: 1.5,
  outline: "none",
  resize: "vertical",
  whiteSpace: "pre-wrap",
  overflow: "hidden",
  boxSizing: "border-box",
};

const pageStyle: CSSProperties = {
  width: "min(190mm, 100%)",
  minHeight: "277mm",
  margin: "0 auto 16px auto",
  background: "#fff",
  boxSizing: "border-box",
  padding: 16,
  boxShadow: "0 0 0 1px rgba(0,0,0,0.16)",
  display: "flex",
  flexDirection: "column",
};

const pageHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  paddingBottom: 10,
  borderBottom: "1px solid #bcbcbc",
  minWidth: 0,
  overflow: "visible",
};

const pageBody: CSSProperties = {
  paddingTop: 12,
  flex: 1,
};

const pageFooter: CSSProperties = {
  paddingTop: 10,
  marginTop: "auto",
  borderTop: "1px solid #bcbcbc",
  fontSize: 11,
  textAlign: "center",
  color: "#555",
};

const logoStyle: CSSProperties = {
  width: 54,
  height: 54,
  objectFit: "contain",
};

const coverHero: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(190px, 240px)",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 18,
  minWidth: 0,
};

const coverTitle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1.1,
  minWidth: 0,
  overflowWrap: "anywhere",
};

const coverSubtitle: CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  color: "#555",
};

const coverCompany: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  textAlign: "right",
  width: "100%",
  maxWidth: 240,
  justifySelf: "end",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const sectionTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: 10,
  fontSize: 24,
  fontWeight: 900,
};

const subHeading: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  marginTop: 14,
  marginBottom: 8,
};

const infoTable: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(130px, 180px) minmax(0, 1fr)",
  borderTop: "1px solid #333",
  borderLeft: "1px solid #333",
  breakInside: "avoid",
};

const infoLabel: CSSProperties = {
  padding: "8px 10px",
  borderRight: "1px solid #333",
  borderBottom: "1px solid #333",
  fontWeight: 700,
  background: "#f6f6f6",
};

const infoValue: CSSProperties = {
  padding: "8px 10px",
  borderRight: "1px solid #333",
  borderBottom: "1px solid #333",
  fontWeight: 600,
  minWidth: 0,
  overflowWrap: "anywhere",
};

const boxed: CSSProperties = {
  border: "1px solid #333",
  padding: 12,
  marginBottom: 12,
  breakInside: "avoid",
};

const compactBoxed: CSSProperties = {
  padding: 10,
};

const boxedTitle: CSSProperties = {
  fontWeight: 900,
  marginBottom: 6,
};

const boxedBody: CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const twoColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const tocGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8,
};

const tocItem: CSSProperties = {
  paddingBottom: 6,
  borderBottom: "1px dotted #aaa",
  fontWeight: 700,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  breakInside: "avoid",
};

const thStyle: CSSProperties = {
  border: "1px solid #333",
  textAlign: "left",
  padding: "7px 8px",
  fontSize: 13,
  background: "#f6f6f6",
};

const tdStyle: CSSProperties = {
  border: "1px solid #333",
  padding: "8px",
  height: 28,
  verticalAlign: "top",
};

const tickCell: CSSProperties = {
  ...tdStyle,
  width: 24,
  minWidth: 24,
  padding: 0,
};

const avoidBreak: CSSProperties = {
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

const signatureGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const signatureBox: CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  breakInside: "avoid",
};

const appendixPageStyle: CSSProperties = {
  width: "min(190mm, 100%)",
  minHeight: "277mm",
  margin: "0 auto 16px auto",
  background: "#fff",
  boxSizing: "border-box",
  padding: 16,
  boxShadow: "0 0 0 1px rgba(0,0,0,0.16)",
  display: "flex",
  flexDirection: "column",
};

const appendixPageBody: CSSProperties = {
  paddingTop: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  flex: 1,
};

const appendixTitle: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1.15,
};

const appendixDescription: CSSProperties = {
  fontSize: 13,
  opacity: 0.82,
};

const appendixFrame: CSSProperties = {
  border: "1px solid #333",
  padding: 6,
  height: "225mm",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "#fff",
};

const appendixImage: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "contain",
};
