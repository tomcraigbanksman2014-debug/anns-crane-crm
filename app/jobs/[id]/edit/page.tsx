import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import JobForm from "../../new/JobForm";

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
        start_date,
        end_date,
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
      .select("id, company_name, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
  ]);

  const errorMessage =
    jobError?.message || customersError?.message || equipmentError?.message || "";

  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        <div style={topRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit Job</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Update live job details.
            </p>
          </div>

          <a href={job?.id ? `/jobs/${job.id}` : "/jobs"} style={backBtn}>
            ← Back
          </a>
        </div>

        {errorMessage ? (
          <div style={errorBox}>{errorMessage}</div>
        ) : !job ? (
          <div style={errorBox}>Job not found.</div>
        ) : (
          <JobForm
            mode="edit"
            customers={(customers ?? []).map((customer: any) => ({
              id: customer.id,
              company_name: customer.company_name ?? null,
            }))}
            equipment={(equipment ?? []).map((item: any) => ({
              id: item.id,
              name: item.name ?? null,
            }))}
            job={{
              id: job.id,
              client_id: job.client_id ?? null,
              equipment_id: job.equipment_id ?? null,
              booking_id: job.booking_id ?? null,
              site_name: job.site_name ?? null,
              site_address: job.site_address ?? null,
              contact_name: job.contact_name ?? null,
              contact_phone: job.contact_phone ?? null,
              job_date: job.job_date ?? null,
              start_date: job.start_date ?? job.job_date ?? null,
              end_date: job.end_date ?? job.job_date ?? null,
              start_time: job.start_time ? String(job.start_time).slice(0, 5) : null,
              end_time: job.end_time ? String(job.end_time).slice(0, 5) : null,
              status: job.status ?? "draft",
              hire_type: job.hire_type ?? null,
              lift_type: job.lift_type ?? null,
              notes: job.notes ?? null,
            }}
          />
        )}
      </div>
    </ClientShell>
  );
}

const topRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const backBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  textDecoration: "none",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
