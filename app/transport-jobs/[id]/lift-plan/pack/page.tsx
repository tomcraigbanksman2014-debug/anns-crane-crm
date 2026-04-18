import type { CSSProperties, ReactNode } from "react";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { matchTransportJobEquipmentProfile } from "../../../../lib/ai/matchEquipmentProfile";
import { getPackAppendixAssets, type PackAppendixAsset } from "../../../../lib/ai/packAppendixAssets";
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

function existingAppendixAssets(profileId: string | null | undefined) {
  return getPackAppendixAssets(profileId);
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
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
    <table style={tableStyle}>
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
    </table>
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

function AppendixPage({
  asset,
  index,
}: {
  asset: PackAppendixAsset;
  index: number;
}) {
  return (
    <PageShell sectionTitle={`Appendix ${index}`}>
      <SectionTitle>{asset.title}</SectionTitle>
      {asset.description ? <div style={{ marginBottom: 12, opacity: 0.82 }}>{asset.description}</div> : null}
      <div style={appendixFrame}>
        <img src={asset.publicPath} alt={asset.title} style={appendixImage} />
      </div>
    </PageShell>
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
          name,
          reg_number,
          vehicle_type,
          trailer_type,
          capacity
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
  const appendixAssets = existingAppendixAssets(equipmentProfile?.id);

  const projectName = sections.cover_project || (job as any)?.load_description || `Transport ${(job as any)?.transport_number ?? ""}`.trim();
  const clientName = client?.company_name || "the client";
  const operatorName = liftPlan?.operator_name || operator?.full_name || "—";
  const appointedPerson = liftPlan?.appointed_person || "Shaun Robinson";
  const supervisor = liftPlan?.lift_supervisor || appointedPerson;
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

  return (
    <div style={wrapper}>
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          body { background: white !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      <div className="print-hide" style={toolbar}>
        <a href={`/transport-jobs/${params.id}/lift-plan`} style={buttonStyle}>
          ← Back to lift plan
        </a>
        <PrintPackButton />
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

      <PageShell sectionTitle="Method, Risk & Sign Off">
        <SectionTitle>4. Load handling, lifting accessories and securing</SectionTitle>
        <InfoTable
          rows={[
            ["Load description", liftPlan?.load_description],
            ["Load weight", liftPlan?.load_weight ? `${liftPlan.load_weight} kg` : "—"],
            ["Lifting accessories", liftPlan?.lifting_accessories],
            ["Load securing method", loadSecuring],
            ["Route notes", routeText],
          ]}
        />

        <SectionTitle>5. Delivery / lifting procedure</SectionTitle>
        <BoxedParagraph>{methodText}</BoxedParagraph>

        <SectionTitle>6. Emergency procedure</SectionTitle>
        <BoxedParagraph>
          {para(
            sections.emergency_procedure || liftPlan?.emergency_procedures,
            `In the event of an emergency, the HIAB operation must stop immediately. The load is to be made safe where possible, the exclusion zone maintained and the site emergency procedures followed. No movement or lifting is to recommence until the situation has been resolved and the area declared safe.`
          )}
        </BoxedParagraph>

        <SectionTitle>7. Risk assessment summary</SectionTitle>
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
        <AppendixPage key={asset.publicPath} asset={asset} index={index + 1} />
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
  width: "190mm",
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
  gridTemplateColumns: "180px 1fr",
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
  gridTemplateColumns: "1fr 1fr",
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
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 14,
};

const signatureBox: CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  breakInside: "avoid",
};

const appendixFrame: CSSProperties = {
  border: "1px solid #333",
  padding: 8,
  minHeight: 620,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const appendixImage: CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  objectFit: "contain",
  maxHeight: 620,
};
