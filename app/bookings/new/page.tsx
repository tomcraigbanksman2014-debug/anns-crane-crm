import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import { getAccessContext, canCreateBookings, canViewInvoices } from "../../lib/access";
import { writeAuditLog } from "../../lib/audit";
import { buildQuarterHourOptions } from "../../lib/timeOptions";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

async function createBooking(formData: FormData) {
  "use server";

  const access = await getAccessContext();

  if (!access.user) {
    redirect("/login?next=/bookings/new");
  }

  if (!canCreateBookings(access)) {
    redirect(
      `/bookings/new?error=${encodeURIComponent(
        "You do not have permission to create bookings."
      )}`
    );
  }

  const supabase = createSupabaseServerClient();

  const clientId = clean(formData.get("client_id"));
  const craneId = clean(formData.get("crane_id")) || null;
  const location = clean(formData.get("location")) || null;
  const siteAddress = clean(formData.get("site_address")) || null;
  const startDate = clean(formData.get("start_date"));
  const endDate = clean(formData.get("end_date"));
  const startTime = clean(formData.get("start_time")) || null;
  const endTime = clean(formData.get("end_time")) || null;
  const status = clean(formData.get("status")) || "Inquiry";
  const hirePrice = clean(formData.get("hire_price"));
  const notes = clean(formData.get("notes")) || null;

  const canSeeInvoices = canViewInvoices(access);
  const invoiceStatus = canSeeInvoices
    ? clean(formData.get("invoice_status")) || "Not Invoiced"
    : "Not Invoiced";
  const vat = canSeeInvoices ? clean(formData.get("vat")) : "20";
  const paymentReceived = canSeeInvoices ? clean(formData.get("payment_received")) : "0";

  if (!clientId || !craneId || !startDate || !endDate) {
    redirect(`/bookings/new?error=${encodeURIComponent("Customer, crane, start date and end date are required.")}`);
  }

  const startAt =
    startDate && startTime ? `${startDate}T${startTime}:00` : null;
  const endAt =
    endDate && endTime ? `${endDate}T${endTime}:00` : null;

  const hirePriceNum = hirePrice ? Number(hirePrice) : 0;
  const vatNum = vat ? Number(vat) : 20;
  const paymentReceivedNum = paymentReceived ? Number(paymentReceived) : 0;
  const totalInvoice =
    Number.isFinite(hirePriceNum) ? hirePriceNum + hirePriceNum * (vatNum / 100) : 0;

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      client_id: clientId,
      crane_id: craneId,
      equipment_id: null,
      location,
      site_address: siteAddress,
      start_date: startDate,
      end_date: endDate,
      start_at: startAt,
      end_at: endAt,
      status,
      invoice_status: invoiceStatus,
      hire_price: Number.isFinite(hirePriceNum) ? hirePriceNum : 0,
      vat: Number.isFinite(vatNum) ? vatNum : 20,
      total_invoice: Number.isFinite(totalInvoice) ? totalInvoice : 0,
      payment_received: Number.isFinite(paymentReceivedNum) ? paymentReceivedNum : 0,
      notes,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/bookings/new?error=${encodeURIComponent(error.message)}`);
  }

  await writeAuditLog({
    actor_user_id: access.user.id,
    actor_username: fromAuthEmail(access.user.email ?? null) || null,
    action: "booking_created",
    entity_type: "booking",
    entity_id: data?.id ?? null,
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

  redirect(`/bookings?success=${encodeURIComponent("Booking created.")}`);
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const access = await getAccessContext();

  if (!access.user) {
    redirect("/login?next=/bookings/new");
  }

  const allowed = canCreateBookings(access);
  const showInvoices = canViewInvoices(access);

  const supabase = createSupabaseServerClient();

  const [{ data: clients }, { data: cranes }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .order("company_name", { ascending: true }),
    supabase
      .from("cranes")
      .select("id, name, reg_number, capacity, status, archived")
      .eq("archived", false)
      .eq("status", "available")
      .order("name", { ascending: true }),
  ]);

  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";
  const timeOptions = buildQuarterHourOptions();

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>New Booking</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Create a booking using cranes only. LOLER lifting gear stays separate.
          </p>

          {!allowed ? (
            <div style={errorBox}>Your staff permissions currently do not allow booking creation.</div>
          ) : null}

          {!showInvoices ? (
            <div style={infoBox}>Invoice fields are hidden for your staff role.</div>
          ) : null}

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          {allowed ? (
            <form action={createBooking} style={{ display: "grid", gap: 14, marginTop: 18 }}>
              <div style={grid2}>
                <SelectField
                  label="Customer *"
                  name="client_id"
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
                  options={[
                    { value: "", label: "— Select crane —" },
                    ...(cranes ?? []).map((c: any) => ({
                      value: c.id,
                      label: `${c.name ?? "Crane"}${c.reg_number ? ` (${c.reg_number})` : ""}${c.capacity ? ` • ${c.capacity}` : ""}`,
                    })),
                  ]}
                />
              </div>

              <Field label="Location / site" name="location" placeholder="Site / location" />
              <TextAreaField label="Site address" name="site_address" rows={2} placeholder="Optional address" />

              <div style={grid2}>
                <Field label="Start date *" name="start_date" type="date" />
                <Field label="End date *" name="end_date" type="date" />
              </div>

              <div style={grid2}>
                <SelectField
                  label="Start time"
                  name="start_time"
                  options={[
                    { value: "", label: "— Select —" },
                    ...timeOptions,
                  ]}
                />
                <SelectField
                  label="End time"
                  name="end_time"
                  options={[
                    { value: "", label: "— Select —" },
                    ...timeOptions,
                  ]}
                />
              </div>

              <div style={grid2}>
                <SelectField
                  label="Status"
                  name="status"
                  options={[
                    { value: "Inquiry", label: "Inquiry" },
                    { value: "Confirmed", label: "Confirmed" },
                    { value: "In Progress", label: "In Progress" },
                    { value: "Completed", label: "Completed" },
                    { value: "Cancelled", label: "Cancelled" },
                  ]}
                />

                {showInvoices ? (
                  <SelectField
                    label="Invoice status"
                    name="invoice_status"
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
                <Field label="Hire price" name="hire_price" type="number" placeholder="0.00" />
                {showInvoices ? (
                  <>
                    <Field label="VAT %" name="vat" type="number" defaultValue="20" />
                    <Field label="Payment received" name="payment_received" type="number" defaultValue="0" />
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
                placeholder="Notes for this crane booking"
              />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="submit" style={primaryBtn}>
                  Create booking
                </button>
                <a href="/bookings" style={secondaryBtn}>
                  Cancel
                </a>
              </div>
            </form>
          ) : (
            <div style={{ marginTop: 18 }}>
              <a href="/bookings" style={secondaryBtn}>
                Back to bookings
              </a>
            </div>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        style={inputStyle}
      />
    </div>
  );
}

function TextAreaField({
  label,
  name,
  rows,
  placeholder,
}: {
  label: string;
  name: string;
  rows: number;
  placeholder?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        name={name}
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
  options,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} style={inputStyle} defaultValue="">
        {options.map((opt) => (
          <option key={`${name}-${opt.value}`} value={opt.value}>
            {opt.label}
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

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
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
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
  border: "none",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
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
  color: "#111",
  fontWeight: 700,
};
