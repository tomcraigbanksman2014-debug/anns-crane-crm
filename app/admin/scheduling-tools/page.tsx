import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function splitIds(value: string) {
  return value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
}

function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function activeWorkingDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  excludeWeekends: boolean
) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate ?? startDate);
  if (!start || !end || end < start) return [] as string[];

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    if (!excludeWeekends || !isWeekend(cursor)) {
      dates.push(isoDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

async function bulkUpdateCraneJobs(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const ids = splitIds(clean(formData.get("job_ids")));

  if (ids.length === 0) {
    redirect("/admin/scheduling-tools?error=No crane job ids provided");
  }

  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  const startDate = clean(formData.get("start_date"));
  const endDate = clean(formData.get("end_date"));
  const status = clean(formData.get("status"));
  const operatorId = clean(formData.get("operator_id"));
  const equipmentId = clean(formData.get("equipment_id"));

  if (startDate) {
    payload.start_date = startDate;
    payload.job_date = startDate;
  }

  if (endDate) payload.end_date = endDate;
  if (status) payload.status = status;
  if (operatorId) payload.operator_id = operatorId;
  if (equipmentId) payload.equipment_id = equipmentId;

  const { error } = await supabase.from("jobs").update(payload).in("id", ids);

  if (error) {
    redirect(`/admin/scheduling-tools?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/admin/scheduling-tools?success=${encodeURIComponent(
      `Updated ${ids.length} crane job(s).`
    )}`
  );
}

async function bulkUpdateTransportJobs(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const ids = splitIds(clean(formData.get("transport_job_ids")));

  if (ids.length === 0) {
    redirect("/admin/scheduling-tools?error=No transport job ids provided");
  }

  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  const transportDate = clean(formData.get("transport_date"));
  const status = clean(formData.get("status"));
  const operatorId = clean(formData.get("operator_id"));
  const vehicleId = clean(formData.get("vehicle_id"));

  if (transportDate) payload.transport_date = transportDate;
  if (status) payload.status = status;
  if (operatorId) payload.operator_id = operatorId;
  if (vehicleId) payload.vehicle_id = vehicleId;

  const { error } = await supabase
    .from("transport_jobs")
    .update(payload)
    .in("id", ids);

  if (error) {
    redirect(`/admin/scheduling-tools?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/admin/scheduling-tools?success=${encodeURIComponent(
      `Updated ${ids.length} transport job(s).`
    )}`
  );
}

export default async function AdminSchedulingToolsPage({
  searchParams,
}: {
  searchParams?: { success?: string; error?: string; date?: string };
}) {
  const supabase = createSupabaseServerClient();

  const successMessage = searchParams?.success
    ? decodeURIComponent(searchParams.success)
    : "";
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";
  const selectedDate = String(searchParams?.date ?? "").trim();

  const [
    { data: operators },
    { data: equipment },
    { data: vehicles },
    { data: jobs },
    { data: transportJobs },
    { data: jobEquipment },
  ] = await Promise.all([
    supabase
      .from("operators")
      .select("id, full_name")
      .order("full_name", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, asset_number")
      .order("name", { ascending: true }),

    supabase
      .from("vehicles")
      .select("id, name, reg_number")
      .order("name", { ascending: true }),

    supabase
      .from("jobs")
      .select(
        "id, job_number, site_name, start_date, end_date, job_date, operator_id, equipment_id, status, exclude_weekends"
      )
      .neq("status", "cancelled"),

    supabase
      .from("transport_jobs")
      .select(
        "id, transport_number, delivery_address, transport_date, delivery_date, operator_id, vehicle_id, status"
      )
      .neq("status", "cancelled"),

    supabase
      .from("job_equipment")
      .select(
        "id, job_id, crane_id, operator_id, start_date, end_date, start_time, end_time"
      )
      .eq("asset_type", "crane"),
  ]);

  const conflictRows: Array<{
    conflict_type: string;
    resource_label: string;
    left_label: string;
    left_time: string;
    right_label: string;
    right_time: string;
  }> = [];

  if (selectedDate) {
    const craneItems = ((jobEquipment ?? [])
      .map((row: any) => {
        const job = (jobs ?? []).find((j: any) => j.id === row.job_id);
        const excludeWeekends = Boolean(job?.exclude_weekends);

        const dates = activeWorkingDates(
          row.start_date ?? job?.start_date ?? job?.job_date,
          row.end_date ??
            job?.end_date ??
            row.start_date ??
            job?.start_date ??
            job?.job_date,
          excludeWeekends
        );

        if (!dates.includes(selectedDate)) return null;

        return {
          resourceType: "crane",
          resourceId: String(row.crane_id ?? ""),
          resourceLabel:
            ((equipment ?? []).find((e: any) => e.id === row.crane_id)?.name) ??
            "Crane",
          operatorId: String(row.operator_id ?? job?.operator_id ?? ""),
          label: `Job #${job?.job_number ?? "—"}${
            job?.site_name ? ` • ${job.site_name}` : ""
          }`,
          time: `${row.start_time ?? "—"} → ${row.end_time ?? "—"}`,
        };
      })
      .filter(Boolean) as any[]);

    const transportItems = ((transportJobs ?? [])
      .filter((row: any) => {
        const start = String(row.transport_date ?? "");
        const end = String(row.delivery_date ?? row.transport_date ?? "");
        return !!start && !!end && start <= selectedDate && end >= selectedDate;
      })
      .map((row: any) => ({
        resourceType: "vehicle",
        resourceId: String(row.vehicle_id ?? ""),
        resourceLabel:
          ((vehicles ?? []).find((v: any) => v.id === row.vehicle_id)?.name) ??
          "Vehicle",
        operatorId: String(row.operator_id ?? ""),
        label: `${row.transport_number ?? "Transport Job"}${
          row.delivery_address ? ` • ${row.delivery_address}` : ""
        }`,
        time: `${row.transport_date ?? selectedDate}`,
      })) as any[]);

    const allItems = [...craneItems, ...transportItems];

    for (let i = 0; i < allItems.length; i++) {
      for (let j = i + 1; j < allItems.length; j++) {
        const a = allItems[i];
        const b = allItems[j];

        if (
          a.resourceId &&
          b.resourceId &&
          a.resourceType === b.resourceType &&
          a.resourceId === b.resourceId
        ) {
          conflictRows.push({
            conflict_type:
              a.resourceType === "crane" ? "Crane conflict" : "Vehicle conflict",
            resource_label: a.resourceLabel,
            left_label: a.label,
            left_time: a.time,
            right_label: b.label,
            right_time: b.time,
          });
        }

        if (a.operatorId && b.operatorId && a.operatorId === b.operatorId) {
          const operatorLabel =
            ((operators ?? []).find((o: any) => o.id === a.operatorId)
              ?.full_name) ?? "Operator";

          conflictRows.push({
            conflict_type: "Operator conflict",
            resource_label: operatorLabel,
            left_label: a.label,
            left_time: a.time,
            right_label: b.label,
            right_time: b.time,
          });
        }
      }
    }
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1400px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Scheduling Tools</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Bulk updates and conflict checks.
              </p>
            </div>

            <a href="/" style={secondaryBtn}>
              ← Back to dashboard
            </a>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <div style={sectionGrid}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Bulk update crane jobs</h2>

              <form action={bulkUpdateCraneJobs} style={{ display: "grid", gap: 12 }}>
                <Field
                  label="Crane job IDs"
                  name="job_ids"
                  textarea
                  rows={5}
                  placeholder="Paste crane job UUIDs"
                />

                <div style={formGrid}>
                  <Field label="New start date" name="start_date" type="date" />
                  <Field label="New end date" name="end_date" type="date" />

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
                        label: `${e.name ?? "Equipment"}${
                          e.asset_number ? ` (${e.asset_number})` : ""
                        }`,
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
                  placeholder="Paste transport job UUIDs"
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
                        label: `${v.name ?? "Vehicle"}${
                          v.reg_number ? ` (${v.reg_number})` : ""
                        }`,
                      }))),
                    ]}
                  />
                </div>

                <button type="submit" style={primaryBtn}>
                  Run transport bulk update
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
                      <div>
                        <strong>A:</strong> {row.left_label}
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.72 }}>{row.left_time}</div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <div>
                        <strong>B:</strong> {row.right_label}
                      </div>
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
