import { createSupabaseServerClient } from "../../../../lib/supabase/server";
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
        site_name,
        site_address,
        contact_name,
        contact_phone,
        clients:client_id (
          company_name
        ),
        equipment:equipment_id (
          name,
          capacity
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

  const client = Array.isArray((job as any)?.clients)
    ? (job as any).clients[0] ?? null
    : (job as any)?.clients ?? null;

  const equipment = Array.isArray((job as any)?.equipment)
    ? (job as any).equipment[0] ?? null
    : (job as any)?.equipment ?? null;

  return (
    <div
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
            ["Job date", fmtDate((job as any)?.job_date)],
            ["Customer", client?.company_name],
            ["Crane", equipment?.name],
            ["Capacity", equipment?.capacity],
            ["Site name", (job as any)?.site_name],
            ["Site address", (job as any)?.site_address],
            ["Site contact", (job as any)?.contact_name],
            ["Site phone", (job as any)?.contact_phone],
          ]}
        />
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
            ["Crane operator", liftPlan?.crane_operator],
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
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
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

const printCard: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12,
  padding: 16,
  breakInside: "avoid",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
};
