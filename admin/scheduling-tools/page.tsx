import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import {
  getActiveEquipment,
  getActiveOperators,
  getActiveVehicles,
} from "../../lib/data/lookups";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parseIds(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[\s,\n\r\t]+/)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
}

function makeTransportNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  const ss = `${d.getSeconds()}`.padStart(2, "0");
  return `TR-${y}${m}${day}-${hh}${mm}${ss}`;
}

function redirectWithMessage(type: "success" | "error", message: string, date?: string) {
  const params = new URLSearchParams();
  params.set(type, message);
  if (date) params.set("date", date);
  redirect(`/admin/scheduling-tools?${params.toString()}`);
}

function timeToMinutes(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const match = v.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function rangesOverlap(
  aStart: number | null,
  aEnd: number | null,
  bStart: number | null,
  bEnd: number | null
) {
  const startA = aStart ?? 0;
  const endA = aEnd ?? aStart ?? 24 * 60;
  const startB = bStart ?? 0;
  const endB = bEnd ?? bStart ?? 24 * 60;

  return startA < endB && startB < endA;
}

async function bulkUpdateJobs(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const ids = parseIds(clean(formData.get("job_ids")));
  const job_date = clean(formData.get("job_date"));
  const status = clean(formData.get("status"));
  const operator_id = clean(formData.get("operator_id"));
  const equipment_id = clean(formData.get("equipment_id"));

  if (ids.length === 0) {
    redirectWithMessage("error", "No crane job IDs supplied.");
  }

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (job_date) updatePayload.job_date = job_date;
  if (status) updatePayload.status = status;
  if (operator_id) {
    updatePayload.operator_id = operator_id;
    updatePayload.main_operator_id = operator_id;
  }
  if (equipment_id) updatePayload.equipment_id = equipment_id;

  const { error } = await supabase
    .from("jobs")
    .update(updatePayload)
    .in("id", ids);

  if (error) {
    redirectWithMessage("error", error.message);
  }

  redirectWithMessage("success", `Updated ${ids.length} crane job(s).`);
}

async function bulkUpdateTransportJobs(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const ids = parseIds(clean(formData.get("transport_job_ids")));
  const transport_date = clean(formData.get("transport_date"));
  const status = clean(formData.get("status"));
  const operator_id = clean(formData.get("operator_id"));
  const vehicle_id = clean(formData.get("vehicle_id"));

  if (ids.length === 0) {
    redirectWithMessage("error", "No transport job IDs supplied.");
  }

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (transport_date) updatePayload.transport_date = transport_date;
  if (status) updatePayload.status = status;
  if (operator_id) updatePayload.operator_id = operator_id;
  if (vehicle_id) updatePayload.vehicle_id = vehicle_id;

  const { error } = await supabase
    .from("transport_jobs")
    .update(updatePayload)
    .in("id", ids);

  if (error) {
    redirectWithMessage("error", error.message);
  }

  redirectWithMessage("success", `Updated ${ids.length} transport job(s).`);
}

async function duplicateCraneJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const sourceId = clean(formData.get("source_job_id"));
  const copies = Math.max(1, Number(clean(formData.get("copies")) || "1"));
  const newDate = clean(formData.get("new_job_date")) || null;

  if (!sourceId) {
    redirectWithMessage("error", "Source crane job ID is required.");
  }

  const [{ data: sourceJob, error: sourceError }, { data: sourceAllocations, error: allocError }] =
    await Promise.all([
      supabase.from("jobs").select("*").eq("id", sourceId).single(),
      supabase.from("job_equipment").select("*").eq("job_id", sourceId),
    ]);

  if (sourceError || !sourceJob) {
    redirectWithMessage("error", sourceError?.message ?? "Source crane job not found.");
  }

  if (allocError) {
    redirectWithMessage("error", allocError.message);
  }

  let created = 0;

  for (let i = 0; i < copies; i += 1) {
    const jobInsert: Record<string, any> = { ...(sourceJob as any) };

    delete jobInsert.id;
    delete jobInsert.created_at;
    delete jobInsert.updated_at;
    delete jobInsert.started_at;
    delete jobInsert.arrived_on_site_at;
    delete jobInsert.lift_completed_at;
    delete jobInsert.completed_at;
    delete jobInsert.customer_signature_name;
    delete jobInsert.operator_signature_name;
    delete jobInsert.signed_off_at;
    delete jobInsert.portal_token;
    delete jobInsert.invoice_created_at;

    jobInsert.status = "draft";
    jobInsert.job_date = newDate || (sourceJob as any).job_date;
    jobInsert.updated_at = new Date().toISOString();

    const { data: createdJob, error: createError } = await supabase
      .from("jobs")
      .insert(jobInsert)
      .select("id")
      .single();

    if (createError || !createdJob?.id) {
      redirectWithMessage("error", createError?.message ?? "Could not duplicate crane job.");
    }

    const allocationRows = (sourceAllocations ?? []).map((item: any) => {
      const row = { ...item };
      delete row.id;
      delete row.created_at;
      delete row.updated_at;
      row.job_id = createdJob.id;
      row.start_date = newDate || row.start_date;
      row.end_date = newDate || row.end_date;
      row.updated_at = new Date().toISOString();
      return row;
    });

    if (allocationRows.length > 0) {
      const { error: insertAllocError } = await supabase
        .from("job_equipment")
        .insert(allocationRows);

      if (insertAllocError) {
        redirectWithMessage("error", insertAllocError.message);
      }
    }

    created += 1;
  }

  redirectWithMessage("success", `Duplicated ${created} crane job(s).`);
}

async function duplicateTransportJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const sourceId = clean(formData.get("source_transport_job_id"));
  const copies = Math.max(1, Number(clean(formData.get("copies")) || "1"));
  const newDate = clean(formData.get("new_transport_date")) || null;

  if (!sourceId) {
    redirectWithMessage("error", "Source transport job ID is required.");
  }

  const { data: sourceJob, error: sourceError } = await supabase
    .from("transport_jobs")
    .select("*")
    .eq("id", sourceId)
    .single();

  if (sourceError || !sourceJob) {
    redirectWithMessage("error", sourceError?.message ?? "Source transport job not found.");
  }

  let created = 0;

  for (let i = 0; i < copies; i += 1) {
    const insertRow: Record<string, any> = { ...(sourceJob as any) };

    delete insertRow.id;
    delete insertRow.created_at;
    delete insertRow.updated_at;

    insertRow.transport_number = makeTransportNumber();
    insertRow.transport_date = newDate || (sourceJob as any).transport_date;
    insertRow.status = "planned";
    insertRow.updated_at = new Date().toISOString();

    const { error: createError } = await supabase
      .from("transport_jobs")
      .insert(insertRow);

    if (createError) {
      redirectWithMessage("error", createError.message);
    }

    created += 1;
  }

  redirectWithMessage("success", `Duplicated ${created} transport job(s).`);
}

type ConflictRow = {
  conflict_type: string;
  resource_label: string;
  left_label: string;
  left_time: string;
  right_label: string;
  right_time: string;
};

export default async function SchedulingToolsPage({
  searchParams,
}: {
  searchParams?: { success?: string; error?: string; date?: string };
}) {
  const supabase = createSupabaseServerClient();

  const selectedDate = searchParams?.date || "";
  const successMessage = searchParams?.success
    ? decodeURIComponent(searchParams.success)
    : "";
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";

  const [
    { data: operators },
    { data: vehicles },
    { data: equipment },
    jobsRes,
    transportRes,
  ] = await Promise.all([
    getActiveOperators(),
    getActiveVehicles(),
    getActiveEquipment(),
    selectedDate
      ? supabase
          .from("jobs")
          .select(`
            id,
            job_number,
            site_name,
            job_date,
            start_time,
            end_time,
            operator_id,
            equipment_id,
            operators:operator_id (
              full_name
            ),
            equipment:equipment_id (
              name,
              asset_number
            )
          `)
          .eq("job_date", selectedDate)
          .neq("status", "cancelled")
      : Promise.resolve({ data: [] as any[], error: null }),
    selectedDate
      ? supabase
          .from("transport_jobs")
          .select(`
            id,
            transport_number,
            transport_date,
            collection_time,
            delivery_time,
            operator_id,
            vehicle_id,
            operators:operator_id (
              full_name
            ),
            vehicles:vehicle_id (
              name,
              reg_number
            )
          `)
          .eq("transport_date", selectedDate)
          .neq("status", "cancelled")
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const conflictRows: ConflictRow[] = [];

  const jobs = jobsRes.data ?? [];
  const transportJobs = transportRes.data ?? [];

  for (let i = 0; i < jobs.length; i += 1) {
    for (let j = i + 1; j < jobs.length; j += 1) {
      const a: any = jobs[i];
      const b: any = jobs[j];

      const overlap = rangesOverlap(
        timeToMinutes(a.start_time),
        timeToMinutes(a.end_time),
        timeToMinutes(b.start_time),
        timeToMinutes(b.end_time)
      );

      if (!overlap) continue;

      if (a.operator_id && b.operator_id && a.operator_id === b.operator_id) {
        conflictRows.push({
          conflict_type: "Operator clash",
          resource_label: Array.isArray(a.operators)
            ? a.operators[0]?.full_name ?? "Operator"
            : a.operators?.full_name ?? "Operator",
          left_label: `Crane Job #${a.job_number ?? "—"} • ${a.site_name ?? "—"}`,
          left_time: `${a.start_time ?? "—"} - ${a.end_time ?? "—"}`,
          right_label: `Crane Job #${b.job_number ?? "—"} • ${b.site_name ?? "—"}`,
          right_time: `${b.start_time ?? "—"} - ${b.end_time ?? "—"}`,
        });
      }

      if (a.equipment_id && b.equipment_id && a.equipment_id === b.equipment_id) {
        const equipLabel = Array.isArray(a.equipment)
          ? `${a.equipment[0]?.name ?? "Equipment"}${a.equipment[0]?.asset_number ? ` (${a.equipment[0].asset_number})` : ""}`
          : `${a.equipment?.name ?? "Equipment"}${a.equipment?.asset_number ? ` (${a.equipment.asset_number})` : ""}`;

        conflictRows.push({
          conflict_type: "Equipment clash",
          resource_label: equipLabel,
          left_label: `Crane Job #${a.job_number ?? "—"} • ${a.site_name ?? "—"}`,
          left_time: `${a.start_time ?? "—"} - ${a.end_time ?? "—"}`,
          right_label: `Crane Job #${b.job_number ?? "—"} • ${b.site_name ?? "—"}`,
          right_time: `${b.start_time ?? "—"} - ${b.end_time ?? "—"}`,
        });
      }
    }
  }

  for (let i = 0; i < transportJobs.length; i += 1) {
    for (let j = i + 1; j < transportJobs.length; j += 1) {
      const a: any = transportJobs[i];
      const b: any = transportJobs[j];

      const overlap = rangesOverlap(
        timeToMinutes(a.collection_time),
        timeToMinutes(a.delivery_time),
        timeToMinutes(b.collection_time),
        timeToMinutes(b.delivery_time)
      );

      if (!overlap) continue;

      if (a.operator_id && b.operator_id && a.operator_id === b.operator_id) {
        conflictRows.push({
          conflict_type: "Transport operator clash",
          resource_label: Array.isArray(a.operators)
            ? a.operators[0]?.full_name ?? "Operator"
            : a.operators?.full_name ?? "Operator",
          left_label: `Transport ${a.transport_number ?? "—"}`,
          left_time: `${a.collection_time ?? "—"} - ${a.delivery_time ?? "—"}`,
          right_label: `Transport ${b.transport_number ?? "—"}`,
          right_time: `${b.collection_time ?? "—"} - ${b.delivery_time ?? "—"}`,
        });
      }

      if (a.vehicle_id && b.vehicle_id && a.vehicle_id === b.vehicle_id) {
        const vehicleLabel = Array.isArray(a.vehicles)
          ? `${a.vehicles[0]?.name ?? "Vehicle"}${a.vehicles[0]?.reg_number ? ` (${a.vehicles[0].reg_number})` : ""}`
          : `${a.vehicles?.name ?? "Vehicle"}${a.vehicles?.reg_number ? ` (${a.vehicles.reg_number})` : ""}`;

        conflictRows.push({
          conflict_type: "Vehicle clash",
          resource_label: vehicleLabel,
          left_label: `Transport ${a.transport_number ?? "—"}`,
          left_time: `${a.collection_time ?? "—"} - ${a.delivery_time ?? "—"}`,
          right_label: `Transport ${b.transport_number ?? "—"}`,
          right_time: `${b.collection_time ?? "—"} - ${b.delivery_time ?? "—"}`,
        });
      }
    }
  }

  for (const job of jobs as any[]) {
    for (const transport of transportJobs as any[]) {
      if (!job.operator_id || !transport.operator_id) continue;
      if (job.operator_id !== transport.operator_id) continue;

      const overlap = rangesOverlap(
        timeToMinutes(job.start_time),
        timeToMinutes(job.end_time),
        timeToMinutes(transport.collection_time),
        timeToMinutes(transport.delivery_time)
      );

      if (!overlap) continue;

      const operatorLabel = Array.isArray(job.operators)
        ? job.operators[0]?.full_name ?? "Operator"
        : job.operators?.full_name ?? "Operator";

      conflictRows.push({
        conflict_type: "Operator clash across crane + transport",
        resource_label: operatorLabel,
        left_label: `Crane Job #${job.job_number ?? "—"} • ${job.site_name ?? "—"}`,
        left_time: `${job.start_time ?? "—"} - ${job.end_time ?? "—"}`,
        right_label: `Transport ${transport.transport_number ?? "—"}`,
        right_time: `${transport.collection_time ?? "—"} - ${transport.delivery_time ?? "—"}`,
      });
    }
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1300px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Scheduling Tools</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Bulk updates, duplication tools and conflict checking for crane and transport work.
              </p>
            </div>

            <a href="/dashboard" style={secondaryBtn}>
              ← Back to dashboard
            </a>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <div style={sectionGrid}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Bulk update crane jobs</h2>
              <form action={bulkUpdateJobs} style={{ display: "grid", gap: 12 }}>
                <Field
                  label="Crane job IDs"
                  name="job_ids"
                  textarea
                  rows={5}
                  placeholder="Paste one or more job UUIDs separated by commas, spaces or new lines"
                />

                <div style={formGrid}>
                  <Field label="New date" name="job_date" type="date" />
                  <SelectField
                    label="New status"
                    name="status"
                    options={[
                      { value: "", label: "No change" },
                      { value: "draft", label: "draft" },
                      { value: "confirmed", label: "confirmed" },
                      { value: "in_progress", label: "in_progress" },
                      { value: "completed", label: "completed" },
                      { value: "cancelled", label: "cancelled" },
                    ]}
                  />
                  <SelectField
                    label="Operator"
                    name="operator_id"
                    options={[
                      { value: "", label: "No change" },
                      ...((operators ?? []).map((o: any) => ({
                        value: o.id,
                        label: o.full_name ?? "Operator",
                      }))),
                    ]}
                  />
                  <SelectField
                    label="Equipment"
                    name="equipment_id"
                    options={[
                      { value: "", label: "No change" },
                      ...((equipment ?? []).map((e: any) => ({
                        value: e.id,
                        label: `${e.name ?? "Equipment"}${e.asset_number ? ` (${e.asset_number})` : ""}`,
                      }))),
                    ]}
                  />
                </div>

                <button type="submit" style={primaryBtn}>
                  Run crane bulk update
                </button>
              </form>
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Bulk update transport jobs</h2>
              <form action={bulkUpdateTransportJobs} style={{ display: "grid", gap: 12 }}>
                <Field
                  label="Transport job IDs"
                  name="transport_job_ids"
                  textarea
                  rows={5}
                  placeholder="Paste one or more transport job UUIDs separated by commas, spaces or new lines"
                />

                <div style={formGrid}>
                  <Field label="New date" name="transport_date" type="date" />
                  <SelectField
                    label="New status"
                    name="status"
                    options={[
                      { value: "", label: "No change" },
                      { value: "planned", label: "planned" },
                      { value: "confirmed", label: "confirmed" },
                      { value: "in_progress", label: "in_progress" },
                      { value: "completed", label: "completed" },
                      { value: "cancelled", label: "cancelled" },
                    ]}
                  />
                  <SelectField
                    label="Driver / Operator"
                    name="operator_id"
                    options={[
                      { value: "", label: "No change" },
                      ...((operators ?? []).map((o: any) => ({
                        value: o.id,
                        label: o.full_name ?? "Operator",
                      }))),
                    ]}
                  />
                  <SelectField
                    label="Vehicle"
                    name="vehicle_id"
                    options={[
                      { value: "", label: "No change" },
                      ...((vehicles ?? []).map((v: any) => ({
                        value: v.id,
                        label: `${v.name ?? "Vehicle"}${v.reg_number ? ` (${v.reg_number})` : ""}`,
                      }))),
                    ]}
                  />
                </div>

                <button type="submit" style={primaryBtn}>
                  Run transport bulk update
                </button>
              </form>
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Duplicate crane job</h2>
              <form action={duplicateCraneJob} style={{ display: "grid", gap: 12 }}>
                <Field label="Source crane job ID" name="source_job_id" placeholder="Paste crane job UUID" />
                <div style={formGrid}>
                  <Field label="Copies" name="copies" type="number" defaultValue="1" />
                  <Field label="New job date" name="new_job_date" type="date" />
                </div>
                <button type="submit" style={primaryBtn}>
                  Duplicate crane job
                </button>
              </form>
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Duplicate transport job</h2>
              <form action={duplicateTransportJob} style={{ display: "grid", gap: 12 }}>
                <Field label="Source transport job ID" name="source_transport_job_id" placeholder="Paste transport job UUID" />
                <div style={formGrid}>
                  <Field label="Copies" name="copies" type="number" defaultValue="1" />
                  <Field label="New transport date" name="new_transport_date" type="date" />
                </div>
                <button type="submit" style={primaryBtn}>
                  Duplicate transport job
                </button>
              </form>
            </section>
          </div>

          <section style={{ ...sectionCard, marginTop: 18 }}>
            <h2 style={sectionTitle}>Conflict checker</h2>

            <form method="GET" style={checkerRow}>
              <div style={{ minWidth: 220 }}>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  name="date"
                  defaultValue={selectedDate}
                  style={inputStyle}
                />
              </div>

              <button type="submit" style={primaryBtn}>
                Check conflicts
              </button>
            </form>

            {!selectedDate ? (
              <div style={infoBox}>Choose a date to check crane and transport conflicts.</div>
            ) : conflictRows.length === 0 ? (
              <div style={successBox}>No conflicts found for {selectedDate}.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {conflictRows.map((row, index) => (
                  <div key={`${row.conflict_type}-${index}`} style={conflictCard}>
                    <div style={{ fontWeight: 1000 }}>{row.conflict_type}</div>
                    <div style={{ marginTop: 4, opacity: 0.82 }}>
                      <strong>Resource:</strong> {row.resource_label}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div><strong>A:</strong> {row.left_label}</div>
                      <div style={{ fontSize: 13, opacity: 0.72 }}>{row.left_time}</div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div><strong>B:</strong> {row.right_label}</div>
                      <div style={{ fontSize: 13, opacity: 0.72 }}>{row.right_time}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  textarea = false,
  rows = 3,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      {textarea ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={rows}
          style={textareaStyle}
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} style={inputStyle}>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const sectionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
  marginTop: 18,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.30)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  fontSize: 22,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const checkerRow: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "end",
  flexWrap: "wrap",
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.78,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  resize: "vertical",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const successBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.10)",
  border: "1px solid rgba(0,180,120,0.25)",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const infoBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
};

const conflictCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,170,0,0.12)",
  border: "1px solid rgba(255,170,0,0.22)",
};
