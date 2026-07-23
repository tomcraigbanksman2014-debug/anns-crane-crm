import type { CSSProperties, ReactNode } from "react";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { matchTransportJobEquipmentProfile } from "../../../../lib/ai/matchEquipmentProfile";
import { getVehicleAppendixAssetsForPack, type PackAppendixAssetItem } from "../../../../lib/assetDocuments";
import { getPackAppendixAssets } from "../../../../lib/ai/packAppendixAssets";
import PrintPackButton from "./PrintPackButton";

type StringMap = Record<string, string | null>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

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

function para(value: string | null | undefined, fallback: string) {
  return value && String(value).trim() ? String(value) : fallback;
}

function splitLines(value: string | null | undefined) {
  if (!value) return [];
  return String(value).split(/\n+/).map((x) => x.trim()).filter(Boolean);
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fmtNumber(value: unknown, digits = 0) {
  const n = numberValue(value);
  if (n === null) return "—";
  return n.toLocaleString("en-GB", { maximumFractionDigits: digits });
}


function defaultSectionText(
  sections: StringMap,
  key: keyof StringMap,
  fallback: string
) {
  const value = sections[key];
  const selected = value && String(value).trim() ? String(value).trim() : fallback;
  return selected;
}

function shortConfig(text: string | null | undefined, fallback: string) {
  if (!text || !text.trim()) return fallback;
  const source = text.trim().toLowerCase();
  if (source.includes("fly") && source.includes("jib")) return "HIAB + fly-jib";
  if (source.includes("jib")) return "HIAB + jib";
  if (source.includes("rigid")) return "Rigid HIAB setup";
  if (source.includes("artic")) return "Artic HIAB setup";
  return text.trim();
}

function PageShell({
  children,
  sectionTitle,
  breakAfter = true,
}: {
  children: ReactNode;
  sectionTitle: string;
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
      <PageHeader sectionTitle={sectionTitle} />
      <div style={pageBody}>{children}</div>
      <PageFooter />
    </section>
  );
}

function PageHeader({ sectionTitle }: { sectionTitle: string }) {
  return (
    <div style={pageHeader}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/icon.png" alt="AnnS Crane Hire logo" style={logoStyle} />
        <div>
          <div style={{ fontWeight: 900, letterSpacing: 0.5 }}>ANNS – HIAB / TRANSPORT PLAN – V1</div>
          <div style={{ fontSize: 11, opacity: 0.72 }}>Anns Crane Hire Ltd</div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, opacity: 0.7 }}>April 2026</div>
        <div style={{ fontWeight: 800 }}>{sectionTitle}</div>
      </div>
    </div>
  );
}

function PageFooter() {
  return (
    <div style={pageFooter}>
      Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={sectionTitleStyle}>{children}</h2>;
}

function InfoTable({ rows }: { rows: Array<[string, any]> }) {
  return (
    <div style={infoTable}>
      {rows.map(([label, value], index) => (
        <div key={`${label}-${index}`} style={{ display: "contents" }}>
          <div style={infoLabel}>{label}</div>
          <div style={infoValue}>{val(value)}</div>
        </div>
      ))}
    </div>
  );
}

function BoxedParagraph({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div style={boxed}>
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
  leftTitle: string;
  leftBody: ReactNode;
  rightTitle: string;
  rightBody: ReactNode;
}) {
  return (
    <div style={twoColGrid}>
      <BoxedParagraph title={leftTitle}>{leftBody}</BoxedParagraph>
      <BoxedParagraph title={rightTitle}>{rightBody}</BoxedParagraph>
    </div>
  );
}

function BlankTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: number;
}) {
  return (
    <div className="lift-pack-table-wrap"><table style={tableStyle}>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} style={thStyle}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            {headers.map((header, idx) => (
              <td key={`${header}-${idx}`} style={tdStyle}></td>
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
}: {
  title: string;
  name?: string | null;
}) {
  return (
    <div style={signatureBox}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 12, borderBottom: "1px solid #333", minHeight: 22 }} />
      <div style={{ marginTop: 6, fontSize: 12 }}>
        Name: {name || "________________"} &nbsp;&nbsp; Date: ________________
      </div>
    </div>
  );
}

function HiabPlanDrawing({
  profileId,
  vehicleLabel,
  radiusM,
  liftHeightM,
  loadDescription,
  supportPosition,
  workingSector,
}: {
  profileId?: string | null;
  vehicleLabel: string;
  radiusM?: number | null;
  liftHeightM?: number | null;
  loadDescription?: string | null;
  supportPosition?: string | null;
  workingSector?: string | null;
}) {
  const isArtic = profileId === "hiab-x-hipro-858" || /\b(?:artic|arctic|tractor)\b/i.test(vehicleLabel);
  const radiusLabel = radiusM && Number.isFinite(radiusM) ? `${radiusM.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m planned radius` : "Planned radius";
  const heightLabel = liftHeightM && Number.isFinite(liftHeightM) ? `${liftHeightM.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m lift height` : "Lift height to be confirmed";
  const bodyEnd = isArtic ? 610 : 510;
  const craneX = isArtic ? 238 : 218;
  const loadX = 700;

  return (
    <div style={drawingGrid}>
      <div style={drawingPanel}>
        <div style={drawingTitle}>Plan view — vehicle, supports, working sector and load</div>
        <svg viewBox="0 0 820 390" role="img" aria-label="HIAB lift plan view" style={drawingSvg}>
          <defs>
            <marker id={`arrow-${profileId || "hiab"}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#111" />
            </marker>
          </defs>
          <rect x="70" y="145" width="150" height="100" rx="8" fill="#e8eef4" stroke="#111" strokeWidth="3" />
          <text x="145" y="198" textAnchor="middle" fontSize="18" fontWeight="700">CAB</text>
          <rect x="220" y="125" width={bodyEnd - 220} height="140" rx="5" fill="#f7f7f7" stroke="#111" strokeWidth="3" />
          <text x={(220 + bodyEnd) / 2} y="200" textAnchor="middle" fontSize="17" fontWeight="700">{isArtic ? "TRACTOR / TRAILER LINE" : "RIGID FLATBED BODY"}</text>
          {isArtic ? <rect x="470" y="115" width="250" height="160" rx="4" fill="none" stroke="#555" strokeWidth="2" strokeDasharray="8 5" /> : null}
          <circle cx={craneX} cy="195" r="25" fill="#cf2e2e" stroke="#111" strokeWidth="3" />
          <text x={craneX} y="202" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800">HIAB</text>
          <line x1={craneX - 15} y1="118" x2={craneX - 15} y2="272" stroke="#111" strokeWidth="5" />
          <line x1={craneX + 115} y1="118" x2={craneX + 115} y2="272" stroke="#111" strokeWidth="5" />
          {[craneX - 15, craneX + 115].map((x, index) => (
            <g key={index}>
              <rect x={x - 32} y="95" width="64" height="22" fill="#ddd" stroke="#111" strokeWidth="2" />
              <rect x={x - 32} y="273" width="64" height="22" fill="#ddd" stroke="#111" strokeWidth="2" />
            </g>
          ))}
          <path d={`M ${craneX} 195 C ${craneX + 115} 65, ${loadX - 120} 65, ${loadX} 195`} fill="none" stroke="#2d69a7" strokeWidth="5" />
          <path d={`M ${craneX} 195 A 280 280 0 0 1 ${craneX + 275} 30`} fill="none" stroke="#8a1f1f" strokeWidth="2" strokeDasharray="10 7" />
          <path d={`M ${craneX} 195 A 280 280 0 0 0 ${craneX + 275} 360`} fill="none" stroke="#8a1f1f" strokeWidth="2" strokeDasharray="10 7" />
          <rect x={loadX - 55} y="155" width="110" height="80" fill="#e7c86d" stroke="#111" strokeWidth="3" />
          <text x={loadX} y="190" textAnchor="middle" fontSize="15" fontWeight="800">LOAD</text>
          <text x={loadX} y="212" textAnchor="middle" fontSize="11">{String(loadDescription || "Planned load").slice(0, 22)}</text>
          <line x1={craneX + 35} y1="330" x2={loadX - 20} y2="330" stroke="#111" strokeWidth="2" markerEnd={`url(#arrow-${profileId || "hiab"})`} />
          <line x1={loadX - 20} y1="330" x2={craneX + 35} y2="330" stroke="#111" strokeWidth="2" markerEnd={`url(#arrow-${profileId || "hiab"})`} />
          <text x={(craneX + loadX) / 2} y="320" textAnchor="middle" fontSize="16" fontWeight="800">{radiusLabel}</text>
          <text x="70" y="35" fontSize="15" fontWeight="800">Vehicle: {vehicleLabel}</text>
          <text x="70" y="58" fontSize="13">Support position: {supportPosition || "Recorded in technical schedule"}</text>
          <text x="70" y="80" fontSize="13">Permitted sector: {workingSector || "Recorded in technical schedule"}</text>
        </svg>
      </div>
      <div style={drawingPanel}>
        <div style={drawingTitle}>Side elevation — boom, radius, height and set-down point</div>
        <svg viewBox="0 0 820 390" role="img" aria-label="HIAB lift side elevation" style={drawingSvg}>
          <defs>
            <marker id={`arrow-side-${profileId || "hiab"}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#111" />
            </marker>
          </defs>
          <line x1="40" y1="320" x2="790" y2="320" stroke="#111" strokeWidth="3" />
          <rect x="80" y="235" width="150" height="75" rx="8" fill="#e8eef4" stroke="#111" strokeWidth="3" />
          <circle cx="115" cy="320" r="22" fill="#333" /><circle cx="198" cy="320" r="22" fill="#333" />
          <rect x="230" y="250" width={isArtic ? 330 : 270} height="55" fill="#f7f7f7" stroke="#111" strokeWidth="3" />
          <circle cx={craneX} cy="245" r="22" fill="#cf2e2e" stroke="#111" strokeWidth="3" />
          <polyline points={`${craneX},245 ${craneX + 80},150 ${loadX - 110},80 ${loadX},105`} fill="none" stroke="#2d69a7" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          <line x1={loadX} y1="105" x2={loadX} y2="215" stroke="#111" strokeWidth="3" />
          <rect x={loadX - 55} y="215" width="110" height="80" fill="#e7c86d" stroke="#111" strokeWidth="3" />
          <line x1={craneX} y1="345" x2={loadX} y2="345" stroke="#111" strokeWidth="2" markerEnd={`url(#arrow-side-${profileId || "hiab"})`} />
          <line x1={loadX} y1="345" x2={craneX} y2="345" stroke="#111" strokeWidth="2" markerEnd={`url(#arrow-side-${profileId || "hiab"})`} />
          <text x={(craneX + loadX) / 2} y="375" textAnchor="middle" fontSize="16" fontWeight="800">{radiusLabel}</text>
          <line x1="760" y1="320" x2="760" y2="105" stroke="#111" strokeWidth="2" markerEnd={`url(#arrow-side-${profileId || "hiab"})`} />
          <line x1="760" y1="105" x2="760" y2="320" stroke="#111" strokeWidth="2" markerEnd={`url(#arrow-side-${profileId || "hiab"})`} />
          <text x="750" y="205" textAnchor="end" fontSize="15" fontWeight="800" transform="rotate(-90 750 205)">{heightLabel}</text>
          <line x1={craneX - 25} y1="305" x2={craneX - 25} y2="330" stroke="#111" strokeWidth="6" />
          <rect x={craneX - 55} y="330" width="60" height="15" fill="#ddd" stroke="#111" strokeWidth="2" />
          <line x1={craneX + 95} y1="305" x2={craneX + 95} y2="330" stroke="#111" strokeWidth="6" />
          <rect x={craneX + 65} y="330" width="60" height="15" fill="#ddd" stroke="#111" strokeWidth="2" />
          <text x="60" y="40" fontSize="14" fontWeight="800">Schematic lifting arrangement — dimensions shown are the saved lift-plan values; drawing not to scale.</text>
        </svg>
      </div>
    </div>
  );
}

function AppendixPage({
  asset,
  index,
}: {
  asset: PackAppendixAssetItem;
  index: number;
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
      <PageHeader sectionTitle={`Appendix ${index}`} />
      <div style={appendixPageBody}>
        <div style={appendixTitle}>{asset.title}</div>
        {asset.description ? <div style={appendixDescription}>{asset.description}</div> : null}
        <div style={appendixFrame}>
          <img src={imageSrc} alt={asset.title} style={appendixImage} />
        </div>
      </div>
    </section>
  );
}

export default async function TransportLiftPlanPackPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: job }, { data: liftPlan }] = await Promise.all([
    supabase
      .from("transport_jobs")
      .select(`
        id,
        transport_number,
        linked_job_id,
        client_id,
        vehicle_id,
        operator_id,
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
          id,
          name,
          reg_number,
          vehicle_type,
          trailer_type,
          capacity,
          vehicle_documents (
            id,
            title,
            document_type,
            extracted_text,
            extracted_profile,
            uploaded_at
          )
        ),
        operators:operator_id (
          full_name,
          phone,
          email
        )
      `)
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("transport_lift_plans").select("*").eq("transport_job_id", params.id).maybeSingle(),
  ]);

  let linkedJob: any = null;
  if ((job as any)?.linked_job_id) {
    const { data } = await supabase
      .from("jobs")
      .select(`id, job_number, site_name, site_address, notes, lift_type, hire_type, cranes:crane_id (name, make, model, capacity)`)
      .eq("id", (job as any).linked_job_id)
      .maybeSingle();
    linkedJob = data ?? null;
  }

  const client = one((job as any)?.clients) as any;
  const vehicle = one((job as any)?.vehicles) as any;
  const operator = one((job as any)?.operators) as any;
  const sections: StringMap = ((liftPlan as any)?.pack_sections as Record<string, string | null> | null) ?? {};

  const equipmentProfile = matchTransportJobEquipmentProfile({ ...(job as any), vehicles: vehicle }, linkedJob);
  const vehicleAppendixAssets = await getVehicleAppendixAssetsForPack(
    vehicle?.id ?? null,
    {
      jobType: (job as any)?.job_type || linkedJob?.lift_type || null,
      vehicleConfiguration: [sections.vehicle_configuration, liftPlan?.vehicle_configuration]
        .filter(Boolean)
        .join("\n"),
      hiabConfiguration: [sections.hiab_configuration, liftPlan?.hiab_configuration]
        .filter(Boolean)
        .join("\n"),
      outriggerSetup: [liftPlan?.outrigger_setup, sections.outrigger_setup]
        .filter(Boolean)
        .join("\n"),
      loadDescription: (job as any)?.load_description || null,
      notes: [
        (job as any)?.notes,
        linkedJob?.notes,
        sections.route_notes,
        sections.access_notes,
        sections.load_securing_method,
      ]
        .filter(Boolean)
        .join("\n"),
    }
  );
  const staticAppendixAssets: PackAppendixAssetItem[] = getPackAppendixAssets(equipmentProfile?.id).map((asset, index) => ({
    key: `static-${equipmentProfile?.id || "hiab"}-${index + 1}`,
    title: asset.title,
    description: asset.description ?? null,
    image_url: asset.publicPath,
    document_type: index === 0 ? "spec_sheet" : "load_chart",
    page_number: index + 1,
    appendix_order: (index + 1) * 10,
    source_type: "vehicle",
    source_document_id: null,
  }));
  const ownedStaticProfile = ["hiab-x-hipro-858", "palfinger-pk65002-sh"].includes(String(equipmentProfile?.id ?? ""));
  const supplementaryVehicleAssets = ownedStaticProfile
    ? vehicleAppendixAssets.filter((asset) => {
        const technicalDocument = ["spec_sheet", "load_chart"].includes(String(asset.document_type ?? "").toLowerCase());
        const sameOwnedModel = equipmentProfile?.id === "hiab-x-hipro-858"
          ? /(?:x[- ]?hipro|\b858\b)/i.test(asset.title)
          : /(?:palfinger|65002)/i.test(asset.title);
        return !(technicalDocument && sameOwnedModel);
      })
    : vehicleAppendixAssets;
  const appendixAssets = ownedStaticProfile
    ? [...staticAppendixAssets, ...supplementaryVehicleAssets]
    : (vehicleAppendixAssets.length ? vehicleAppendixAssets : staticAppendixAssets);

  const projectName = sections.cover_project || (job as any)?.load_description || `Transport ${(job as any)?.transport_number ?? ""}`.trim();
  const clientName = client?.company_name || "the client";
  const printTitle = [
    client?.company_name || "Customer",
    "Transport Lift Plan Pack",
    (job as any)?.transport_number ? `Transport ${(job as any).transport_number}` : null,
  ].filter(Boolean).join(" - ");
  const operatorName = liftPlan?.operator_name || operator?.full_name || "—";
  const appointedPerson = liftPlan?.appointed_person || "Shaun Robinson";
  const supervisor = String(liftPlan?.lift_supervisor ?? "").trim();
  const vehicleLabel = [vehicle?.name, vehicle?.vehicle_type, vehicle?.reg_number].filter(Boolean).join(" ") || vehicle?.name || "—";
  const hiabConfig = shortConfig(sections.hiab_configuration || liftPlan?.hiab_configuration, equipmentProfile?.title || "Planned HIAB setup");
  const vehicleConfig = sections.vehicle_configuration || liftPlan?.vehicle_configuration || vehicleLabel;
  const routeText = para(sections.route_notes || liftPlan?.route_notes, "Route to be checked for access restrictions, width, height, turning space and any site delivery constraints before movement.");
  const accessText = para(sections.access_notes || liftPlan?.access_notes, "Collection and delivery access points are to be confirmed before positioning the HIAB vehicle. The working area must remain clear and suitable for stabiliser deployment.");
  const loadSecuring = para(sections.load_securing_method || liftPlan?.load_securing_method, "The load is to be secured using suitable rated restraints and checked before departure and after positioning, in accordance with the planned transport method.");
  const methodText = sections.lifting_procedure || liftPlan?.method_statement || "1. Arrive on site and confirm access / set-down area. 2. Establish exclusion zone and stabiliser area. 3. Deploy stabilisers on suitable support. 4. Connect the load using the planned accessories. 5. Carry out a controlled lift, transfer and set-down under the direction of the designated signaller. 6. Secure or release the load as planned and recover equipment safely.";
  const riskText = sections.risk_assessment_summary || liftPlan?.risk_assessment || "Key risks include vehicle instability, poor stabiliser support, load movement, overhead obstructions, communication failure, adverse weather, public interface and unsafe delivery / set-down conditions.";
  const emergencyContacts = splitLines(sections.emergency_contacts || "").join("\n");
  const equipmentList = splitLines(sections.equipment_list || "").join("\n");
  const toolboxNotes = splitLines(sections.toolbox_notes || "").join("\n");
  const technicalProfileId = sections.hiab_profile_id || equipmentProfile?.id || null;
  const technicalConfiguration = sections.hiab_verified_configuration || equipmentProfile?.setupOptions?.[0]?.label || equipmentProfile?.title || "—";
  const technicalRadiusM = numberValue(liftPlan?.lift_radius);
  const technicalHeightM = numberValue(liftPlan?.lift_height);
  const chartCapacityKg = numberValue(sections.hiab_chart_capacity_kg);
  const accessoryWeightKg = numberValue(sections.hiab_accessory_weight_kg) ?? 0;
  const totalLiftedWeightKg = numberValue(sections.hiab_total_lifted_weight_kg);
  const utilisationPercent = numberValue(sections.hiab_utilisation_percent);
  const worstCaseOutriggerLoadKg = numberValue(sections.hiab_worst_case_outrigger_load_kg);
  const matLengthM = numberValue(sections.hiab_mat_length_m);
  const matWidthM = numberValue(sections.hiab_mat_width_m);
  const matCount = numberValue(sections.hiab_mats_under_loaded_outrigger);
  const totalMatAreaM2 = numberValue(sections.hiab_total_mat_area_m2);
  const pressureKgM2 = numberValue(sections.hiab_ground_pressure_kg_m2);
  const pressureTM2 = numberValue(sections.hiab_ground_pressure_t_m2);

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

          .lift-pack-table-wrap { overflow: visible !important; }
          .lift-pack-table-wrap table { min-width: 0 !important; }
        }
      `}</style>

      <div className="print-hide" style={toolbar}>
        <a href={`/transport-jobs/${params.id}/lift-plan`} style={buttonStyle}>
          ← Back to lift plan
        </a>
        <PrintPackButton printTitle={printTitle} />
      </div>

      <PageShell sectionTitle="Cover Sheet">
        <div style={coverHero}>
          <div>
            <div style={coverTitle}>ANNS – HIAB / TRANSPORT PLAN – V1</div>
            <div style={coverSubtitle}>April 2026</div>
          </div>
          <div style={coverCompany}>
            <div>Anns Crane Hire Ltd</div>
            <div>6 Bay St, Port Tennant, Swansea, SA1 8LB</div>
            <div>01792 641653 • info@annscranehire.co.uk</div>
          </div>
        </div>

        <InfoTable
          rows={[
            ["Client", clientName],
            ["Project", projectName],
            ["Transport Job", (job as any)?.transport_number],
            ["Transport Date", fmtDate((job as any)?.transport_date)],
            ["Delivery Date", fmtDate((job as any)?.delivery_date || (job as any)?.transport_date)],
            ["Collection Address", (job as any)?.collection_address],
            ["Delivery Address", (job as any)?.delivery_address],
            ["Site / Delivery Contact", client?.contact_name || client?.company_name],
            ["Appointed Person", appointedPerson],
            ["Prepared on behalf of", "ANNS CRANE HIRE LTD"],
            ["Lift Classification", sections.lift_classification || "HIAB / transport operation"],
            ["Vehicle", vehicleLabel],
            ["HIAB configuration", hiabConfig],
            ["Vehicle configuration", vehicleConfig],
          ]}
        />
      </PageShell>

      <PageShell sectionTitle="Overview">
        <SectionTitle>1. Scope and Operation Overview</SectionTitle>
        <BoxedParagraph title="Scope of works">
          {para(
            sections.scope_of_works || liftPlan?.load_description,
            `Works comprise the HIAB / transport operation for ${clientName}, including collection, transport and delivery of the planned load using the allocated HIAB vehicle and lifting team.`
          )}
        </BoxedParagraph>

        <TwoColumnBoxes
          leftTitle="Collection and delivery sequence"
          leftBody={para(
            sections.pickup_method || liftPlan?.pickup_method,
            `The collection and delivery sequence is to be controlled by the appointed lifting team. Vehicle position, stabiliser deployment, lifting radius and delivery / set-down area are to be checked before any lift is undertaken.`
          )}
          rightTitle="Route and access"
          rightBody={`${routeText}\n\n${accessText}`}
        />

        <TwoColumnBoxes
          leftTitle="On-site communication"
          leftBody={para(
            sections.communication,
            `Communication will be maintained using agreed hand signals and, where needed, two-way radio. The designated signaller remains in control of the HIAB movement and will coordinate with the site representative throughout the operation.`
          )}
          rightTitle="Weather conditions"
          rightBody={para(
            sections.weather_conditions || liftPlan?.weather_limitations || equipmentProfile?.weatherNote,
            `HIAB operations must not proceed in unsafe wind, lightning, heavy rain or poor visibility. Final operating limits are to be checked against the selected vehicle / crane chart, stabiliser position and site conditions.`
          )}
        />
      </PageShell>

      <PageShell sectionTitle="Vehicle, HIAB & Controls">
        <SectionTitle>2. Vehicle / HIAB Details</SectionTitle>
        <InfoTable
          rows={[
            ["Vehicle", vehicleLabel],
            ["HIAB profile", equipmentProfile?.title || "—"],
            ["Operator", operatorName],
            ["Linked crane job", linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"],
            ["Max capacity", equipmentProfile?.maxCapacityKg ? `${equipmentProfile.maxCapacityKg.toLocaleString("en-GB")} kg` : "—"],
            ["Hydraulic outreach", equipmentProfile?.maxHydraulicOutreachM ? `${equipmentProfile.maxHydraulicOutreachM} m` : "—"],
            ["Jib / max outreach", equipmentProfile?.maxJibOutreachM ? `${equipmentProfile.maxJibOutreachM} m` : "—"],
          ]}
        />

        <BoxedParagraph title="HIAB / vehicle notes">
          {para(
            sections.hiab_details,
            equipmentProfile?.summary || "Selected HIAB profile to be checked against the current specification and chart."
          )}
        </BoxedParagraph>

        <SectionTitle>3. Ground, access and stabiliser controls</SectionTitle>
        <TwoColumnBoxes
          leftTitle="Ground conditions"
          leftBody={para(
            sections.ground_conditions || liftPlan?.ground_conditions,
            `Ground conditions are to be confirmed before stabilisers are deployed. The vehicle must only be operated on ground capable of supporting the vehicle, stabilisers and load reactions.`
          )}
          rightTitle="Traffic / pedestrian management"
          rightBody={para(
            sections.traffic_pedestrian_management || liftPlan?.traffic_management,
            `The working area is to be cordoned off and kept clear of unauthorised persons and traffic before HIAB operations commence.`
          )}
        />

        <BoxedParagraph title="HIAB set-up procedure">
          {para(
            sections.hiab_setup_procedure || liftPlan?.hiab_configuration || equipmentProfile?.configurationNote,
            `The HIAB vehicle is to be positioned on suitable ground and set up in accordance with the manufacturer’s instructions, selected chart and site restrictions. Stabiliser / support positions must be confirmed before the load is taken.`
          )}
          {"\n\n"}
          {para(liftPlan?.outrigger_setup || equipmentProfile?.outriggersNote, "Stabilisers are to be deployed on suitable support pads / mats and the vehicle kept level throughout the operation.")}
        </BoxedParagraph>
      </PageShell>

      <PageShell sectionTitle="Verified Technical Schedule">
        <SectionTitle>4. Verified HIAB chart and load calculation</SectionTitle>
        <InfoTable
          rows={[
            ["HIAB profile", equipmentProfile?.title || sections.hiab_profile_title || "—"],
            ["Verified fitted configuration", technicalConfiguration],
            ["Planned lifting radius", technicalRadiusM === null ? "—" : `${fmtNumber(technicalRadiusM, 2)} m`],
            ["Load weight", liftPlan?.load_weight ? `${fmtNumber(liftPlan.load_weight, 1)} kg` : "—"],
            ["Hook / lifting accessories", `${fmtNumber(accessoryWeightKg, 1)} kg`],
            ["Gross lifted load", totalLiftedWeightKg === null ? "—" : `${fmtNumber(totalLiftedWeightKg, 1)} kg`],
            ["Chart capacity at planned radius", chartCapacityKg === null ? "—" : `${fmtNumber(chartCapacityKg)} kg`],
            ["Chart utilisation", utilisationPercent === null ? "—" : `${fmtNumber(utilisationPercent, 1)}%`],
            ["Manufacturer chart source", sections.hiab_chart_source || "—"],
            ["Selected stabiliser / support position", sections.hiab_stabiliser_position || liftPlan?.outrigger_setup || "—"],
            ["Permitted working sector", sections.hiab_working_sector || "—"],
          ]}
        />

        <SectionTitle>5. Worst-case ground-bearing calculation</SectionTitle>
        <InfoTable
          rows={[
            ["Vehicle operating / gross planning weight", sections.hiab_vehicle_operating_weight_kg ? `${fmtNumber(sections.hiab_vehicle_operating_weight_kg)} kg` : "—"],
            ["Gross lifted load", totalLiftedWeightKg === null ? "—" : `${fmtNumber(totalLiftedWeightKg, 1)} kg`],
            ["Worst-case load factor", sections.hiab_ground_bearing_factor || "0.75"],
            ["Worst-case outrigger load used for ground-bearing calculation", worstCaseOutriggerLoadKg === null ? "—" : `${fmtNumber(worstCaseOutriggerLoadKg)} kg`],
            ["Mat / spreader dimensions", matLengthM && matWidthM ? `${fmtNumber(matLengthM, 2)} m × ${fmtNumber(matWidthM, 2)} m` : "—"],
            ["Pieces under worst-case loaded stabiliser", matCount === null ? "—" : fmtNumber(matCount)],
            ["Total bearing area", totalMatAreaM2 === null ? "—" : `${fmtNumber(totalMatAreaM2, 3)} m²`],
            ["Worst-case ground pressure", pressureKgM2 === null ? "—" : `${fmtNumber(pressureKgM2)} kg/m² / ${fmtNumber(pressureTM2, 2)} t/m²`],
          ]}
        />
        <BoxedParagraph title="Calculation basis">
          The worst-case outrigger load shown is the vehicle operating / gross planning weight plus the gross lifted load, multiplied by the saved 0.75 factor. The pressure value uses the saved total mat / spreader bearing area under the worst-case loaded stabiliser. Where an exact manufacturer or supplier support reaction is available for the selected configuration, that published value must take precedence.
        </BoxedParagraph>
      </PageShell>

      <PageShell sectionTitle="Lift Arrangement Drawing">
        <SectionTitle>6. CAD-style lift arrangement</SectionTitle>
        <HiabPlanDrawing
          profileId={technicalProfileId}
          vehicleLabel={vehicleLabel}
          radiusM={technicalRadiusM}
          liftHeightM={technicalHeightM}
          loadDescription={liftPlan?.load_description || (job as any)?.load_description}
          supportPosition={sections.hiab_stabiliser_position || liftPlan?.outrigger_setup}
          workingSector={sections.hiab_working_sector}
        />
      </PageShell>

      <PageShell sectionTitle="Method, Risk & Sign Off">
        <SectionTitle>7. Load handling, lifting accessories and securing</SectionTitle>
        <InfoTable
          rows={[
            ["Load description", liftPlan?.load_description],
            ["Load weight", liftPlan?.load_weight ? `${liftPlan.load_weight} kg` : "—"],
            ["Lifting accessories", liftPlan?.lifting_accessories],
            ["Load securing method", loadSecuring],
            ["Route notes", routeText],
          ]}
        />

        <SectionTitle>8. Delivery / lifting procedure</SectionTitle>
        <BoxedParagraph>{methodText}</BoxedParagraph>

        <SectionTitle>9. Emergency procedure</SectionTitle>
        <BoxedParagraph>
          {para(
            sections.emergency_procedure || liftPlan?.emergency_procedures,
            `In the event of an emergency, the HIAB operation must stop immediately. The load is to be made safe where possible, the exclusion zone maintained and the site emergency procedures followed. No movement or lifting is to recommence until the situation has been resolved and the area declared safe.`
          )}
        </BoxedParagraph>

        <SectionTitle>10. Risk assessment summary</SectionTitle>
        <TwoColumnBoxes
          leftTitle="Risk summary"
          leftBody={riskText}
          rightTitle="Control measures"
          rightBody={para(
            liftPlan?.control_measures,
            `Use competent personnel, confirm stabiliser support, maintain communication, control the work area, monitor weather and follow the approved pack and manufacturer guidance throughout the operation.`
          )}
        />
      </PageShell>

      <PageShell sectionTitle="Sign Offs">
        <InfoTable
          rows={[
            ["Lift plan complete", yesNo(liftPlan?.lift_plan_complete)],
            ["RAMS complete", yesNo(liftPlan?.rams_complete)],
            ["Approved by", liftPlan?.approved_by],
            ["Approved at", fmtDateTime(liftPlan?.approved_at)],
            ["Approval notes", liftPlan?.approval_notes],
          ]}
        />

        <div style={subHeading}>Attendance Record</div>
        <BlankTable headers={["Name", "Employer", "Signature"]} rows={4} />

        <div style={signatureGrid}>
          <SignatureRow title="Appointed Person signature" name={appointedPerson} />
          <SignatureRow title="Lift Supervisor signature" name={supervisor} />
          <SignatureRow title="Operator signature" name={operatorName} />
          <SignatureRow title="Client / delivery sign-off" name={client?.contact_name || clientName} />
        </div>

        {toolboxNotes ? <BoxedParagraph title="Toolbox / sign-off notes">{toolboxNotes}</BoxedParagraph> : null}
        {emergencyContacts ? <BoxedParagraph title="Emergency contacts">{emergencyContacts}</BoxedParagraph> : null}
        {equipmentList ? <BoxedParagraph title="Equipment list">{equipmentList}</BoxedParagraph> : null}
      </PageShell>

      <PageShell sectionTitle="Wind / Conditions Record" breakAfter={true}>
        <div style={subHeading}>Wind speed / conditions record</div>
        <InfoTable
          rows={[
            ["Project", projectName],
            ["Lift Supervisor", supervisor],
            ["Date", fmtDate((job as any)?.transport_date)],
          ]}
        />
        <div style={{ height: 8 }} />
        <BlankTable headers={["Time", "Conditions / Wind", "OK To Work (Y / N)", "Notes"]} rows={10} />
      </PageShell>

      {appendixAssets.map((asset, index) => (
        <AppendixPage key={`${asset.title}-${asset.page_number}-${index}`} asset={asset} index={index + 1} />
      ))}
    </div>
  );
}

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
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 18,
};

const coverTitle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1.1,
};

const coverSubtitle: CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  color: "#555",
};

const coverCompany: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  textAlign: "right",
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
};

const boxed: CSSProperties = {
  border: "1px solid #333",
  padding: 12,
  marginBottom: 12,
  breakInside: "avoid",
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

const drawingGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 14,
};

const drawingPanel: CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  breakInside: "avoid",
};

const drawingTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  marginBottom: 6,
};

const drawingSvg: CSSProperties = {
  width: "100%",
  height: "auto",
  display: "block",
  background: "#fff",
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
