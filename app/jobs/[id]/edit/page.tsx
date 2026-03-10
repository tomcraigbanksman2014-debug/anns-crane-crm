import ClientShell from "../../../ClientShell";
import JobForm from "../../new/JobForm";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export default async function EditJobPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: job, error: jobError },
    { data: customers, error: customersError },
    { data: equipment, error: equipmentError },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        client_id,
        equipment_id,
        booking_id,
        site_name,
        site_address,
        contact_name,
        contact_phone,
        job_date,
        start_time,
        end_time,
        status,
        hire_type,
        lift_type,
        notes
      `)
      .eq("id", params.id)
      .single(),
    supabase
      .from("clients")
      .select("id, company_name")
      .order("company_name", { ascending: true }),
    supabase
      .from("equipment")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  const errorMessage =
    jobError?.message || customersError?.message || equipmentError?.message;

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit job</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Update crane hire job details.
            </p>
          </div>

          <a href={job?.id ? `/jobs/${job.id}` : "/jobs"} style={btnStyle}>
            ← Back
          </a>
        </div>

        {errorMessage ? (
          <div style={errorBox}>{errorMessage}</div>
        ) : !job ? (
          <div style={errorBox}>Job not found.</div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <JobForm
              mode="edit"
              customers={customers ?? []}
              equipment={equipment ?? []}
              job={job as any}
            />
          </div>
        )}
      </div>
    </ClientShell>
  );
}

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
