import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";
import { buildQuarterHourOptions } from "../../../lib/timeOptions";

type CheckboxOption = {
  value: string;
  label: string;
  muted?: string;
};

const AUTO_ROW_NOTE_PREFIX = "[JOB_FORM_AUTO]";

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

function numberOrZero(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function countBillableDays(startDate: string, endDate: string, excludeWeekends: boolean) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    const isWeekend = day === 0 || day === 6;

    if (!excludeWeekends || !isWeekend) {
      count += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function uniqueValues(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(
      values
        .map((value) => clean(value))
        .filter(Boolean)
    )
  );
}

function autoRowNote(kind: string) {
  return `${AUTO_ROW_NOTE_PREFIX}:${kind}`;
}

function isAutoRow(row: any) {
  return String(row?.notes ?? "").startsWith(AUTO_ROW_NOTE_PREFIX);
}

function buildAutoRows(args: {
  jobId: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  selectedLiftingAssetSelections: string[];
  selectedEquipmentIds: string[];
  selectedOperatorIds: string[];
  calculatedSubtotal: number;
}) {
  const rows: Record<string, any>[] = [];
  let sellAssigned = false;

  const nextSellRate = () => {
    if (sellAssigned) return 0;
    sellAssigned = true;
    return args.calculatedSubtotal;
  };

  for (const selection of args.selectedLiftingAssetSelections) {
    const [kind, assetId] = selection.split(":");
    if (!assetId) continue;

    rows.push({
      job_id: args.jobId,
      asset_type: kind === "vehicle" ? "vehicle" : "crane",
      crane_id: kind === "crane" ? assetId : null,
      vehicle_id: kind === "vehicle" ? assetId : null,
      start_date: args.startDate,
      end_date: args.endDate,
      start_time: args.startTime,
      end_time: args.endTime,
      agreed_sell_rate: nextSellRate(),
      notes: autoRowNote("crane"),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  for (const equipmentId of args.selectedEquipmentIds) {
    rows.push({
      job_id: args.jobId,
      asset_type: "equipment",
      equipment_id: equipmentId,
      start_date: args.startDate,
      end_date: args.endDate,
      start_time: args.startTime,
      end_time: args.endTime,
      agreed_sell_rate: nextSellRate(),
      notes: autoRowNote("equipment"),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  for (const operatorId of args.selectedOperatorIds) {
    rows.push({
      job_id: args.jobId,
      asset_type: "other",
      operator_id: operatorId,
      item_name: "Operator",
      start_date: args.startDate,
      end_date: args.endDate,
      start_time: args.startTime,
      end_time: args.endTime,
      agreed_sell_rate: nextSellRate(),
      notes: autoRowNote("operator"),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return rows;
}

function isHiabVehicle(vehicle: any) {
  const text = [
    vehicle?.name,
    vehicle?.vehicle_type,
    vehicle?.capacity,
    vehicle?.trailer_type,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return text.includes("hiab");
}

function DropdownCheckboxGroup({
  title,
  name,
  options,
  selectedValues,
  hint,
}: {
  title: string;
  name: string;
  options: CheckboxOption[];
  selectedValues: string[];
  hint: string;
}) {
  const selected = new Set(selectedValues);

  return (
    <details style={dropdownWrapStyle} open={selectedValues.length > 0}>
      <summary style={dropdownSummaryStyle}>{title}</summary>
      <div style={dropdownHintStyle}>{hint}</div>
      {options.length === 0 ? (
        <div style={emptyListStyle}>No options available.</div>
      ) : (
        <div style={checkboxListStyle}>
          {options.map((option) => (
            <label key={`${name}-${option.value}`} style={checkboxItemStyle}>
              <input type="checkbox" name={name} value={option.value} defaultChecked={selected.has(option.value)} />
              <span>
                <span style={checkboxLabelStyle}>{option.label}</span>
                {option.muted ? <span style={checkboxMutedStyle}>{option.muted}</span> : null}
              </span>
            </label>
          ))}
        </div>
      )}
    </details>
  );
}

async function updateJob(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect(`/jobs?error=${encodeURIComponent("Job id missing.")}`);
  }

  const startDate = clean(formData.get("start_date")) || null;
  const endDate = clean(formData.get("end_date")) || null;

  if (!startDate || !endDate) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent("Start date and end date are required.")}`);
  }

  if (endDate < startDate) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent("End date cannot be earlier than start date.")}`);
  }

  const selectedLiftingAssetSelections = uniqueValues(formData.getAll("selected_lifting_asset_ids"));
  const selectedEquipmentIds = uniqueValues(formData.getAll("selected_equipment_ids"));
  const selectedOperatorIds = uniqueValues(formData.getAll("selected_operator_ids"));

  const priceMode = clean(formData.get("price_mode")) || "full_job";
  const excludeWeekends = clean(formData.get("exclude_weekends")) === "on";
  const fullJobPrice = numberOrZero(formData.get("full_job_price"));
  const pricePerDay = numberOrZero(formData.get("price_per_day"));
  const billableDays = countBillableDays(startDate, endDate, excludeWeekends);

  const calculatedSubtotal =
    priceMode === "per_day"
      ? Number((pricePerDay * billableDays).toFixed(2))
      : Number(fullJobPrice.toFixed(2));

  const payload = {
    client_id: clean(formData.get("client_id")) || null,
    crane_id: (selectedLiftingAssetSelections.find((value) => value.startsWith("crane:")) || "").replace(/^crane:/, "") || null,
    equipment_id: selectedEquipmentIds[0] || null,
    operator_id: selectedOperatorIds[0] || null,
    main_operator_id: selectedOperatorIds[0] || null,
    site_name: clean(formData.get("site_name")) || null,
    site_address: clean(formData.get("site_address")) || null,
    contact_name: clean(formData.get("contact_name")) || null,
    contact_phone: clean(formData.get("contact_phone")) || null,
    start_date: startDate,
    end_date: endDate,
    job_date: startDate,
    start_time: clean(formData.get("start_time")) || null,
    end_time: clean(formData.get("end_time")) || null,
    status: clean(formData.get("status")) || "draft",
    hire_type: clean(formData.get("hire_type")) || null,
    lift_type: clean(formData.get("lift_type")) || null,
    notes: clean(formData.get("notes")) || null,
    price_mode: priceMode,
    price_per_day: priceMode === "per_day" ? pricePerDay : null,
    exclude_weekends: excludeWeekends,
    invoice_subtotal: calculatedSubtotal,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("jobs")
    .update(payload)
    .eq("id", id);

  if (error) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("job_equipment")
    .select("id, notes")
    .eq("job_id", id);

  if (existingRowsError) {
    redirect(`/jobs/${id}/edit?error=${encodeURIComponent(existingRowsError.message)}`);
  }

  const autoRowIds = (existingRows ?? []).filter(isAutoRow).map((row: any) => row.id);

  if (autoRowIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("job_equipment")
      .delete()
      .in("id", autoRowIds);

    if (deleteError) {
      redirect(`/jobs/${id}/edit?error=${encodeURIComponent(deleteError.message)}`);
    }
  }

  const autoRows = buildAutoRows({
    jobId: id,
    startDate,
    endDate,
    startTime: payload.start_time,
    endTime: payload.end_time,
    selectedLiftingAssetSelections,
    selectedEquipmentIds,
    selectedOperatorIds,
    calculatedSubtotal,
  });

  if (autoRows.length > 0) {
    const { error: insertError } = await supabase
      .from("job_equipment")
      .insert(autoRows);

    if (insertError) {
      redirect(`/jobs/${id}/edit?error=${encodeURIComponent(insertError.message)}`);
    }
  }

  redirect(`/jobs/${id}?success=${encodeURIComponent("Job updated.")}`);
}

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const timeOptions = buildQuarterHourOptions();

  const [
    { data: job, error: jobError },
    { data: customers, error: customersError },
    { data: equipment, error: equipmentError },
    { data: cranes },
    { data: vehicles },
    { data: operators },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        client_id,
        crane_id,
        equipment_id,
        operator_id,
        main_operator_id,
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
        notes,
        invoice_subtotal,
        invoice_amount,
        total_invoice,
        price_mode,
        price_per_day,
        exclude_weekends,
        job_equipment (
          id,
          asset_type,
          crane_id,
          equipment_id,
          operator_id,
          notes
        )
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
      .select("id, name, asset_number, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("cranes")
      .select("id, name, reg_number, fleet_number, archived, status")
      .eq("archived", false)
      .eq("status", "available")
      .order("name", { ascending: true }),

    supabase
      .from("vehicles")
      .select("id, name, reg_number, vehicle_type, trailer_type, capacity, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("operators")
      .select("id, full_name, archived, status")
      .eq("archived", false)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);

  const errorMessage =
    searchParams?.error ||
    jobError?.message ||
    customersError?.message ||
    equipmentError?.message ||
    "";

  const currentFullJobPrice =
    job?.invoice_subtotal ?? job?.invoice_amount ?? job?.total_invoice ?? 0;

  const autoRows = ((job as any)?.job_equipment ?? []).filter(isAutoRow);
  const fallbackRows = autoRows.length > 0 ? autoRows : [];

  const selectedLiftingAssetSelections = Array.from(
    new Set(
      [
        ...(fallbackRows
          .filter((row: any) => String(row.asset_type ?? "").toLowerCase() === "crane")
          .map((row: any) => `crane:${String(row.crane_id ?? "")}`)
          .filter((value: string) => value !== "crane:")),
        ...(fallbackRows
          .filter((row: any) => String(row.asset_type ?? "").toLowerCase() === "vehicle")
          .map((row: any) => `vehicle:${String(row.vehicle_id ?? "")}`)
          .filter((value: string) => value !== "vehicle:")),
        job?.crane_id ? `crane:${String((job as any).crane_id)}` : "",
      ].filter(Boolean)
    )
  );

  const selectedEquipmentIds = Array.from(
    new Set(
      [
        ...(fallbackRows
          .filter((row: any) => String(row.asset_type ?? "").toLowerCase() === "equipment")
          .map((row: any) => String(row.equipment_id ?? ""))
          .filter(Boolean)),
        job?.equipment_id ? String((job as any).equipment_id) : "",
      ].filter(Boolean)
    )
  );

  const selectedOperatorIds = Array.from(
    new Set(
      [
        ...(fallbackRows
          .map((row: any) => String(row.operator_id ?? ""))
          .filter(Boolean)),
        job?.main_operator_id ? String((job as any).main_operator_id) : "",
        job?.operator_id ? String((job as any).operator_id) : "",
      ].filter(Boolean)
    )
  );

  const hiabOptions: CheckboxOption[] = [
    ...(cranes ?? []).map((crane: any) => ({
      value: `crane:${crane.id}`,
      label: crane.name ?? "Crane",
      muted: [crane.reg_number ? `Reg ${crane.reg_number}` : "", crane.fleet_number ? `Fleet ${crane.fleet_number}` : ""]
        .filter(Boolean)
        .join(" • "),
    })),
    ...((vehicles ?? [])
      .filter((vehicle: any) => isHiabVehicle(vehicle))
      .map((vehicle: any) => ({
        value: `vehicle:${vehicle.id}`,
        label: vehicle.name ?? "HIAB",
        muted: [vehicle.reg_number ? `Reg ${vehicle.reg_number}` : "", vehicle.vehicle_type ? vehicle.vehicle_type : ""]
          .filter(Boolean)
          .join(" • "),
      }))),
  ];

  const equipmentOptions: CheckboxOption[] = (equipment ?? []).map((item: any) => ({
    value: item.id,
    label: item.name ?? "Unnamed equipment",
    muted: item.asset_number ? `Asset ${item.asset_number}` : "",
  }));

  const operatorOptions: CheckboxOption[] = (operators ?? []).map((operator: any) => ({
    value: operator.id,
    label: operator.full_name ?? "Operator",
  }));

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
          <div style={errorBox}>{decodeURIComponent(errorMessage)}</div>
        ) : !job ? (
          <div style={errorBox}>Job not found.</div>
        ) : (
          <form action={updateJob} style={cardStyle}>
            <input type="hidden" name="id" value={job.id} />

            <div style={fieldWrap}>
              <label style={labelStyle}>Customer</label>
              <select name="client_id" defaultValue={job.client_id ?? ""} style={inputStyle}>
                <option value="">Select customer</option>
                {(customers ?? []).map((customer: any) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company_name ?? "Unnamed customer"}
                  </option>
                ))}
              </select>
            </div>

            <div style={grid3}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Job start date *</label>
                <input type="date" name="start_date" defaultValue={job.start_date ?? job.job_date ?? ""} style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Job end date *</label>
                <input type="date" name="end_date" defaultValue={job.end_date ?? job.job_date ?? ""} style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Status</label>
                <select name="status" defaultValue={job.status ?? "draft"} style={inputStyle}>
                  <option value="draft">Draft</option>
                  <option value="provisional">Provisional</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="late_cancelled">Late Cancelled</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div style={grid2}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Start time</label>
                <select name="start_time" defaultValue={job.start_time ? String(job.start_time).slice(0, 5) : ""} style={inputStyle}>
                  <option value="">Select time</option>
                  {timeOptions.map((option) => (
                    <option key={`start-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>End time</label>
                <select name="end_time" defaultValue={job.end_time ? String(job.end_time).slice(0, 5) : ""} style={inputStyle}>
                  <option value="">Select time</option>
                  {timeOptions.map((option) => (
                    <option key={`end-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Site name</label>
              <input name="site_name" defaultValue={job.site_name ?? ""} style={inputStyle} />
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Site address</label>
              <textarea name="site_address" defaultValue={job.site_address ?? ""} rows={3} style={textareaStyle} />
            </div>

            <div style={grid2}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Site contact name</label>
                <input name="contact_name" defaultValue={job.contact_name ?? ""} style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Site contact phone</label>
                <input name="contact_phone" defaultValue={job.contact_phone ?? ""} style={inputStyle} />
              </div>
            </div>

            <div style={grid2}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Hire type</label>
                <input name="hire_type" defaultValue={job.hire_type ?? ""} style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Lift type</label>
                <input name="lift_type" defaultValue={job.lift_type ?? ""} style={inputStyle} />
              </div>
            </div>

            <section style={pricingBox}>
              <h3 style={pricingHeading}>Pricing</h3>

              <div style={grid2}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Price mode</label>
                  <select name="price_mode" defaultValue={job.price_mode ?? "full_job"} style={inputStyle}>
                    <option value="full_job">Full job price</option>
                    <option value="per_day">Price per day</option>
                  </select>
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Exclude weekends on multi-day jobs</label>
                  <label style={checkboxRow}>
                    <input type="checkbox" name="exclude_weekends" defaultChecked={Boolean(job.exclude_weekends)} />
                    Free up weekends and continue the job after
                  </label>
                </div>
              </div>

              <div style={grid2}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Full job price</label>
                  <input
                    name="full_job_price"
                    type="number"
                    step="0.01"
                    defaultValue={job.price_mode === "per_day" ? "" : String(currentFullJobPrice ?? 0)}
                    style={inputStyle}
                  />
                </div>

                <div style={fieldWrap}>
                  <label style={labelStyle}>Price per day</label>
                  <input
                    name="price_per_day"
                    type="number"
                    step="0.01"
                    defaultValue={job.price_per_day != null ? String(job.price_per_day) : ""}
                    style={inputStyle}
                  />
                </div>
              </div>
            </section>

            <section style={pricingBox}>
              <h3 style={pricingHeading}>Assets and labour</h3>

              <DropdownCheckboxGroup
                title="Cranes / HIABs"
                name="selected_lifting_asset_ids"
                options={hiabOptions}
                selectedValues={selectedLiftingAssetSelections}
                hint="Tick every crane or HIAB needed on the job."
              />

              <DropdownCheckboxGroup
                title="Equipment"
                name="selected_equipment_ids"
                options={equipmentOptions}
                selectedValues={selectedEquipmentIds}
                hint="Tick every equipment item needed on the job."
              />

              <DropdownCheckboxGroup
                title="Operators / labour"
                name="selected_operator_ids"
                options={operatorOptions}
                selectedValues={selectedOperatorIds}
                hint="Tick all operators or labour you need linked to this job."
              />
            </section>

            <div style={fieldWrap}>
              <label style={labelStyle}>Notes</label>
              <textarea name="notes" defaultValue={job.notes ?? ""} rows={5} style={textareaStyle} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>Update job</button>
              <a href={`/jobs/${job.id}`} style={secondaryBtn}>Cancel</a>
            </div>
          </form>
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

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  display: "grid",
  gap: 14,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
  resize: "vertical",
};

const pricingBox: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const pricingHeading: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  minHeight: 42,
};

const dropdownWrapStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.82)",
  overflow: "hidden",
};

const dropdownSummaryStyle: React.CSSProperties = {
  cursor: "pointer",
  padding: "11px 12px",
  fontWeight: 800,
};

const dropdownHintStyle: React.CSSProperties = {
  padding: "0 12px 8px 12px",
  fontSize: 12,
  opacity: 0.72,
};

const checkboxListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "0 12px 12px 12px",
  maxHeight: 250,
  overflowY: "auto",
};

const checkboxItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "8px 0",
  borderTop: "1px solid rgba(0,0,0,0.06)",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 700,
  fontSize: 13,
};

const checkboxMutedStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  opacity: 0.7,
  marginTop: 2,
};

const emptyListStyle: React.CSSProperties = {
  padding: "0 12px 12px 12px",
  fontSize: 12,
  opacity: 0.72,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};
