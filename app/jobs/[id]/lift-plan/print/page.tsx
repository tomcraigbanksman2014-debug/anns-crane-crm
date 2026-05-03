import type { CSSProperties } from "react";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getPrimaryCraneContext, matchCraneJobEquipmentProfile } from "../../../../lib/ai/matchEquipmentProfile";
import PrintLiftPlanButton from "./PrintLiftPlanButton";

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
  return value || "—";
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function flatten<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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

function craneLabel(crane: any, allocation: any) {
  const parts = [crane?.name, crane?.make, crane?.model].filter(Boolean);
  const base = parts.join(" ").trim() || crane?.name || allocation?.item_name || "—";

  const dates = [allocation?.start_date, allocation?.end_date].filter(Boolean).join(" to ");
  const startTime = allocation?.start_time ? `Start ${allocation.start_time}` : "";
  const meta = [dates, startTime].filter(Boolean).join(" • ");

  return meta && base !== "—" ? `${base} (${meta})` : base;
}

export default async function LiftPlanPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: job }, { data: liftPlan }] = await Promise.all([
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
        crane_id,
        operator_id,
        main_operator_id,
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

    supabase
      .from("lift_plans")
      .select("*")
      .eq("job_id", params.id)
      .maybeSingle(),
  ]);

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

  return (
    <div
      className="lift-plan-print-page"
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 24,
        color: "#111",
        background: "#fff",
        minHeight: "100vh",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
      }}
    >
      <style>{`
        @media screen and (max-width: 760px) {
          .lift-plan-print-page {
            padding: 16px 12px 28px !important;
          }

          .lift-plan-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media print {
          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="print-hide"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>AnnS Crane Hire Lift Plan & RAMS</h1>
        <PrintLiftPlanButton />
      </div>

      <section style={printCard}>
        <h2 style={sectionTitle}>Job Details</h2>
        <PrintGrid
          rows={[
            ["Job #", (job as any)?.job_number],
            ["Job date", fmtDate((job as any)?.job_date ?? (job as any)?.start_date)],
            ["Customer", client?.company_name],
            ["Crane", craneLabel(crane, allocation)],
            ["Capacity", formatCapacity(equipmentProfile, crane)],
            ["Site name", (job as any)?.site_name],
            ["Site address", (job as any)?.site_address],
            ["Site contact", (job as any)?.contact_name],
            ["Site phone", (job as any)?.contact_phone],
            ["Hire type", (job as any)?.hire_type],
            ["Lift type", (job as any)?.lift_type],
            ["Crane operator", operator?.full_name],
          ]}
        />

        {equipmentProfile ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 800, opacity: 0.78, marginBottom: 6 }}>Selected equipment profile</div>
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#faf7e8",
              }}
            >
              <div style={{ fontWeight: 800 }}>{equipmentProfile.title}</div>
              <div style={{ marginTop: 4, fontSize: 14 }}>{equipmentProfile.summary}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section style={printCard}>
        <h2 style={sectionTitle}>Lift Details</h2>
        <PrintGrid
          rows={[
            ["Load description", liftPlan?.load_description],
            ["Load weight (kg)", liftPlan?.load_weight],
            ["Lift radius (m)", liftPlan?.lift_radius],
            ["Lift height (m)", liftPlan?.lift_height],
            ["Sling type", liftPlan?.sling_type],
            ["Lifting accessories", liftPlan?.lifting_accessories],
          ]}
        />
      </section>

      <section style={printCard}>
        <h2 style={sectionTitle}>Setup & Conditions</h2>
        <PrintBlock label="Crane configuration" value={liftPlan?.crane_configuration} />
        <PrintBlock label="Outrigger setup" value={liftPlan?.outrigger_setup} />
        <PrintBlock label="Ground conditions" value={liftPlan?.ground_conditions} />
        <PrintBlock label="Exclusion zone details" value={liftPlan?.exclusion_zone_details} />
        <PrintBlock label="Weather limitations" value={liftPlan?.weather_limitations} />
      </section>

      <section style={printCard}>
        <h2 style={sectionTitle}>RAMS</h2>
        <PrintBlock label="Method statement" value={liftPlan?.method_statement} />
        <PrintBlock label="Risk assessment" value={liftPlan?.risk_assessment} />
        <PrintBlock label="Site hazards" value={liftPlan?.site_hazards} />
        <PrintBlock label="Control measures" value={liftPlan?.control_measures} />
        <PrintBlock label="PPE required" value={liftPlan?.ppe_required} />
        <PrintBlock label="Emergency procedures" value={liftPlan?.emergency_procedures} />
      </section>

      <section style={printCard}>
        <h2 style={sectionTitle}>Personnel</h2>
        <PrintGrid
          rows={[
            ["Lift supervisor", liftPlan?.lift_supervisor],
            ["Appointed person", liftPlan?.appointed_person],
            ["Crane operator", liftPlan?.crane_operator || operator?.full_name],
          ]}
        />
      </section>

      <section style={printCard}>
        <h2 style={sectionTitle}>Checklist & Approval</h2>
        <PrintGrid
          rows={[
            ["Lift plan complete", yesNo(liftPlan?.lift_plan_complete)],
            ["RAMS complete", yesNo(liftPlan?.rams_complete)],
            ["Approved by", liftPlan?.approved_by],
            ["Approved at", fmtDateTime(liftPlan?.approved_at)],
          ]}
        />
        <PrintBlock label="Approval notes" value={liftPlan?.approval_notes} />
      </section>
    </div>
  );
}

function PrintGrid({
  rows,
}: {
  rows: Array<[string, any]>;
}) {
  return (
    <div
      className="lift-plan-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(160px, 220px) minmax(0, 1fr)",
        gap: 10,
      }}
    >
      {rows.map(([label, value], index) => (
        <div key={`${label}-${index}`} style={{ display: "contents" }}>
          <div style={{ fontWeight: 800, opacity: 0.78 }}>{label}</div>
          <div>{val(value)}</div>
        </div>
      ))}
    </div>
  );
}

function PrintBlock({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 800, opacity: 0.78, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.12)",
          whiteSpace: "pre-wrap",
        }}
      >
        {val(value)}
      </div>
    </div>
  );
}

const printCard: CSSProperties = {
  marginTop: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12,
  padding: 16,
  breakInside: "avoid",
};

const sectionTitle: CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
};
