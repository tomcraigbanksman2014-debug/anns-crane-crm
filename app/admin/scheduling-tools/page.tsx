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
