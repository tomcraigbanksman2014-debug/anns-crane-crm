import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";
import { getAccessContext, canCreateBookings, canViewInvoices } from "../../../lib/access";
import { writeAuditLog } from "../../../lib/audit";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function dateInputValue(value: string | null | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function timeInputValue(value: string | null | undefined) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(11, 16);
}

async function updateBooking(formData: FormData) {
  "use server";

  const access = await getAccessContext();

  if (!access.user) {
    redirect("/login?next=/bookings");
  }

  if (!canCreateBookings(access)) {
    const id = clean(formData.get("id"));
    redirect(`/bookings/${id}/edit?error=${encodeURIComponent("You do not have permission to edit bookings.")}`);
  }

  const supabase = createSupabaseServerClient();

  const id = clean(formData.get("id"));
  const clientId = clean(formData.get("client_id"));
  const craneId = clean(formData.get("crane_id")) || null;
  const startDate = clean(formData.get("start_date"));
  const endDate = clean(formData.get("end_date"));
  const startTime = clean(formData.get("start_time"));
  const endTime = clean(formData.get("end_time"));
  const location = clean(formData.get("location")) || null;
  const siteAddress = clean(formData.get("site_address")) || null;
  const status = clean(formData.get("status")) || "Inquiry";
  const poNumber = clean(formData.get("po_number")) || null;
  const jobReference = clean(formData.get("job_reference")) || null;
  const operatorName = clean(formData.get("operator_name")) || null;
  const hirePrice = clean(formData.get("hire_price"));
  const notes = clean(formData.get("notes")) || null;

  const canSeeInvoices = canViewInvoices(access);
  const invoiceStatus = canSeeInvoices
    ? clean(formData.get("invoice_status")) || "Not Invoiced"
    : "Not Invoiced";
  const vat = canSeeInvoices ? clean(formData.get("vat")) : "20";
  const paymentReceived = canSeeInvoices ? clean(formData.get("payment_received")) : "0";

  if (!id || !clientId || !craneId || !startDate || !endDate || !startTime || !endTime) {
    redirect(
      `/bookings/${id}/edit?error=${encodeURIComponent(
        "Customer, crane, start date/time and end date/time are required."
      )}`
    );
  }

  const startAt = `${startDate}T${startTime}:00`;
  const endAt = `${endDate}T${endTime}:00`;

  const hirePriceNum = hirePrice ? Number(hirePrice) : 0;
  const vatNum = vat ? Number(vat) : 20;
  const paymentReceivedNum = paymentReceived ? Number(paymentReceived) : 0;
  const totalInvoice =
    Number.isFinite(hirePriceNum) ? hirePriceNum + hirePriceNum * (vatNum / 100) : 0;

  const { error } = await supabase
    .from("bookings")
    .update({
      client_id: clientId,
      crane_id: craneId,
      equipment_id: null,
      start_date: startDate,
      end_date: endDate,
      start_at: startAt,
      end_at: endAt,
      location,
      site_address: siteAddress,
      status,
      po_number: poNumber,
      job_reference: jobReference,
      operator_name: operatorName,
      invoice_status: invoiceStatus,
      hire_price: Number.isFinite(hirePriceNum) ? hirePriceNum : 0,
      vat: Number.isFinite(vatNum) ? vatNum : 20,
      total_invoice: Number.isFinite(totalInvoice) ? totalInvoice : 0,
      payment_received: Number.isFinite(paymentReceivedNum) ? paymentReceivedNum : 0,
      driver_notes: notes,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/bookings/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  await writeAuditLog({
    actor_user_id: access.user.id,
    actor_username: fromAuthEmail(access.user.email ?? null) || null,
    action: "booking_updated",
    entity_type: "booking",
    entity_id: id,
    meta: {
      client_id: clientId,
      crane_id: craneId,
      location,
      start_date: startDate,
      end_date: endDate,
      status,
      invoice_status: invoiceStatus,
      total_invoice: Number.isFinite(totalInvoice) ? totalInvoice : 0,
    },
  });

  redirect(`/bookings/${id}?success=${encodeURIComponent("Booking updated.")}`);
}

async function deleteBooking(formData: FormData) {
  "use server";

  const access = await getAccessContext();

  if (!access.user) {
    redirect("/login?next=/bookings");
  }

  if (!canCreateBookings(access)) {
    const id = clean(formData.get("id"));
    redirect(`/bookings/${id}/edit?error=${encodeURIComponent("You do not have permission to delete bookings.")}`);
  }

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect(`/bookings?error=${encodeURIComponent("Booking id missing.")}`);
  }

  const { error } = await supabase.from("bookings").delete().eq("id", id);

  if (error) {
    redirect(`/bookings/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  await writeAuditLog({
    actor_user_id: access.user.id,
    actor_username: fromAuthEmail(access.user.email ?? null) || null,
    action: "booking_deleted",
    entity_type: "booking",
    entity_id: id,
    meta: {},
  });

  redirect(`/bookings?success=${encodeURIComponent("Booking deleted.")}`);
}

export default async function EditBookingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const access = await getAccessContext();

  if (!access.user) {
    redirect(`/login?next=/bookings/${params.id}/edit`);
  }

  const allowed = canCreateBookings(access);
  const showInvoices = canViewInvoices(access);

  const supabase = createSupabaseServerClient();

  const [{ data: booking, error }, { data: clients }, { data: cranes }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("*")
        .eq("id", params.id)
        .single(),
      supabase
        .from("clients")
        .select("id, company_name")
        .order("company_name", { ascending: true }),
      supabase
        .from("cranes")
        .select("id, name, reg_number, capacity, status, archived")
        .eq("archived", false)
        .order("name", { ascending: true }),
    ]);

  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  const totalPreview =
    Number(booking?.hire_price ?? 0) +
    Number(booking?.hire_price ?? 0) * (Number(booking?.vat ?? 20) / 100);

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div style={outerHeader}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit Booking</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Update crane booking details.
            </p>
          </div>

          <a href={`/bookings/${params.id}`} style={backBtn}>
            ← Back
          </a>
        </div>

        <div style={pageCard}>
          {!allowed ? (
            <div style={errorBox}>Your staff permissions currently do not allow booking editing.</div>
          ) : null}

          {!showInvoices ? (
            <div style={infoBox}>Invoice fields are hidden for your staff role.</div>
          ) : null}

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {error ? <div style={errorBox}>{error.message}</div> : null}
          {!booking && !error ? <div style={errorBox}>Booking not found.</div> : null}

          {booking && !error && allowed ? (
            <>
              <form action={updateBooking} style={{ display: "grid", gap: 12 }}>
                <input type="hidden" name="id" value={booking.id} />

                <div style={grid2}>
                  <SelectField
                    label="Customer *"
                    name="client_id"
                    defaultValue={booking.client_id ?? ""}
                    options={[
                      { value: "", label: "— Select customer —" },
                      ...(clients ?? []).map((c: any) => ({
                        value: c.id,
                        label: c.company_name ?? "Customer",
                      })),
                    ]}
                  />

                  <SelectField
                    label="Crane *"
                    name="crane_id"
                    defaultValue={booking.crane_id ?? ""}
                    options={[
                      { value: "", label: "— Select crane —" },
                      ...(cranes ?? []).map((c: any) => ({
                        value: c.id,
                        label: `${c.name ?? "Crane"}${c.reg_number ? ` (${c.reg_number})` : ""}${c.capacity ? ` • ${c.capacity}` : ""}`,
                      })),
                    ]}
                  />
                </div>

                <div style={grid4}>
                  <Field
                    label="Start date *"
                    name="start_date"
                    type="date"
                    defaultValue={dateInputValue(booking.start_date ?? booking.start_at)}
                  />
                  <Field
                    label="Start time *"
                    name="start_time"
                    type="time"
                    defaultValue={timeInputValue(booking.start_at)}
                  />
                  <Field
                    label="End date *"
                    name="end_date"
                    type="date"
                    defaultValue={dateInputValue(booking.end_date ?? booking.end_at)}
                  />
                  <Field
                    label="End time *"
                    name="end_time"
                    type="time"
                    defaultValue={timeInputValue(booking.end_at)}
                  />
                </div>

                <div style={grid2}>
                  <Field
                    label="Location"
                    name="location"
                    defaultValue={booking.location ?? ""}
                  />
                  <SelectField
                    label="Status"
                    name="status"
                    defaultValue={booking.status ?? "Inquiry"}
                    options={[
                      { value: "Inquiry", label: "Inquiry" },
                      { value: "Confirmed", label: "Confirmed" },
                      { value: "In Progress", label: "In Progress" },
                      { value: "Completed", label: "Completed" },
                      { value: "Cancelled", label: "Cancelled" },
                    ]}
                  />
                </div>

                <TextAreaField
                  label="Site address"
                  name="site_address"
                  rows={2}
                  defaultValue={booking.site_address ?? ""}
                />

                <div style={grid4}>
                  <Field
                    label="PO number"
                    name="po_number"
                    defaultValue={booking.po_number ?? ""}
                    placeholder="Customer PO"
                  />
                  <Field
                    label="Job reference"
                    name="job_reference"
                    defaultValue={booking.job_reference ?? ""}
                    placeholder="Internal / site ref"
                  />
                  <Field
                    label="Operator name"
                    name="operator_name"
                    defaultValue={booking.operator_name ?? ""}
                    placeholder="Crane operator"
                  />
                  {showInvoices ? (
                    <SelectField
                      label="Invoice status"
                      name="invoice_status"
                      defaultValue={booking.invoice_status ?? "Not Invoiced"}
                      options={[
                        { value: "Not Invoiced", label: "Not Invoiced" },
                        { value: "Sent", label: "Sent" },
                        { value: "Part Paid", label: "Part Paid" },
                        { value: "Paid", label: "Paid" },
                        { value: "Overdue", label: "Overdue" },
                      ]}
                    />
                  ) : (
                    <div />
                  )}
                </div>

                <div style={grid3}>
                  <Field
                    label="Hire price"
                    name="hire_price"
                    type="number"
                    defaultValue={String(booking.hire_price ?? 0)}
                  />
                  {showInvoices ? (
                    <>
                      <Field
                        label="VAT %"
                        name="vat"
                        type="number"
                        defaultValue={String(booking.vat ?? 20)}
                      />
                      <Field
                        label="Payment received"
                        name="payment_received"
                        type="number"
                        defaultValue={String(booking.payment_received ?? 0)}
                      />
                    </>
                  ) : (
                    <>
                      <div />
                      <div />
                    </>
                  )}
                </div>

                <TextAreaField
                  label="Booking notes"
                  name="notes"
                  rows={4}
                  defaultValue={booking.notes ?? booking.driver_notes ?? ""}
                  placeholder="Lift notes / site notes / driver notes"
                />

                {showInvoices ? (
                  <div style={footerBar}>
                    <div style={{ fontSize: 13, opacity: 0.78 }}>
                      Crane booking edit is active.
                    </div>
                    <div style={{ fontWeight: 900 }}>
                      VAT: {Number(booking.vat ?? 20).toFixed(2)} | Total: {Number(totalPreview).toFixed(2)}
                    </div>
                  </div>
                ) : (
                  <div style={footerBar}>
                    <div style={{ fontSize: 13, opacity: 0.78 }}>
                      Crane booking edit is active.
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" style={primaryBtn}>
                    Save booking
                  </button>

                  <a href={`/bookings/${params.id}`} style={secondaryBtn}>
                    Cancel
                  </a>
                </div>
              </form>

              <form action={deleteBooking} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={booking.id} />
                <button
                  type="submit"
                  style={dangerBtn}
                >
                  Delete
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        type={type}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  rows,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows: number;
  placeholder?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        style={textareaStyle}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const outerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
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

const grid4: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
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
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  textDecoration: "none",
};

const dangerBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  color: "#8b0000",
  fontWeight: 900,
  border: "1px solid rgba(255,0,0,0.20)",
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const infoBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  color: "#111",
  fontWeight: 700,
};

const footerBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};
