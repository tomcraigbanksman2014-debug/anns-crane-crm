import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import EquipmentAllocationsCreate from "../../components/EquipmentAllocationsCreate";

type AllocationInput = {
  equipment_id?: string;
  operator_id?: string;
  source_type?: "owned" | "cross_hire";
  supplier_id?: string;
  purchase_order_id?: string;
  item_name?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  agreed_cost?: string | number;
  supplier_reference?: string;
  notes?: string;
};

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parseAllocations(raw: string): AllocationInput[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildNotes(
  notes: string | null,
  site_address: string | null,
  contact_name: string | null,
  contact_phone: string | null
) {
  const parts: string[] = [];

  if (notes) parts.push(notes);
  if (site_address) parts.push(`Site address: ${site_address}`);
  if (contact_name) parts.push(`Site contact: ${contact_name}`);
  if (contact_phone) parts.push(`Site phone: ${contact_phone}`);

  return parts.join("\n") || null;
}

function redirectWithError(message: string) {
  const params = new URLSearchParams({ error: message });
  redirect(`/bookings/new?${params.toString()}`);
}

async function createBooking(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const client_id = clean(formData.get("client_id")) || null;
  const booking_date = clean(formData.get("booking_date")) || null;
  const start_time = clean(formData.get("start_time")) || null;
  const end_time = clean(formData.get("end_time")) || null;

  const site_name = clean(formData.get("site_name")) || null;
  const site_address = clean(formData.get("site_address")) || null;
  const contact_name = clean(formData.get("contact_name")) || null;
  const contact_phone = clean(formData.get("contact_phone")) || null;

  const status = clean(formData.get("status")) || "confirmed";
  const notes = clean(formData.get("notes")) || null;
  const invoice_status = clean(formData.get("invoice_status")) || "not_invoiced";

  const rawAllocations = clean(formData.get("equipment_allocations_json"));
  const allocations = parseAllocations(rawAllocations).filter(
    (item) => item.equipment_id || item.item_name
  );

  const first = allocations[0];

  const combinedNotes = buildNotes(
    notes,
    site_address,
    contact_name,
    contact_phone
  );

  const { data: createdBooking, error } = await supabase
    .from("bookings")
    .insert({
      client_id,
      start_date: booking_date,
      start_time,
      end_time,
      location: site_name,
      notes: combinedNotes,
      status,
      invoice_status,
      equipment_id: first?.equipment_id || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !createdBooking) {
    redirectWithError(error?.message ?? "Could not create booking.");
  }

  if (allocations.length > 0) {
    const rows = allocations.map((item) => ({
      booking_id: createdBooking.id,
      equipment_id: item.equipment_id || null,
      operator_id: item.operator_id || null,
      source_type: item.source_type || "owned",
      supplier_id: item.source_type === "cross_hire" ? item.supplier_id || null : null,
      purchase_order_id:
        item.source_type === "cross_hire" ? item.purchase_order_id || null : null,
      item_name: item.item_name || null,
      booking_date: item.start_date || booking_date,
      start_time: item.start_time || start_time,
      end_time: item.end_time || end_time,
      agreed_cost: Number(item.agreed_cost || 0) || 0,
      supplier_reference: item.supplier_reference || null,
      notes: item.notes || null,
      updated_at: new Date().toISOString(),
    }));

    const { error: allocationError } = await supabase
      .from("booking_equipment")
      .insert(rows);

    if (allocationError) {
      redirectWithError(allocationError.message);
    }
  }

  redirect("/bookings");
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: clients },
    { data: equipment },
    { data: operators },
    { data: suppliers },
    { data: purchaseOrders },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .order("company_name", { ascending: true }),

    supabase
      .from("equipment")
      .select("id, name, asset_number")
      .order("name", { ascending: true }),

    supabase
      .from("operators")
      .select("id, full_name")
      .eq("status", "active")
      .order("full_name", { ascending: true }),

    supabase
      .from("suppliers")
      .select("id, company_name")
      .eq("status", "active")
      .order("company_name", { ascending: true }),

    supabase
      .from("purchase_orders")
      .select("id, po_number")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <h1 style={{ marginTop: 0 }}>Create Booking</h1>

          {errorMessage && <div style={errorBox}>{errorMessage}</div>}

          <form action={createBooking} style={{ marginTop: 18 }}>
            <div style={gridStyle}>
              <SelectField
                label="Customer"
                name="client_id"
                options={(clients ?? []).map((c: any) => ({
                  value: c.id,
                  label: c.company_name,
                }))}
              />

              <Field label="Booking date" name="booking_date" type="date" />
              <Field label="Start time" name="start_time" type="time" />
              <Field label="End time" name="end_time" type="time" />
              <Field label="Site name" name="site_name" />
              <Field label="Site contact" name="contact_name" />
              <Field label="Site phone" name="contact_phone" />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Site address</label>
              <textarea name="site_address" rows={3} style={textareaStyle} />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Notes</label>
              <textarea name="notes" rows={5} style={textareaStyle} />
            </div>

            <EquipmentAllocationsCreate
              equipmentOptions={(equipment ?? []).map((e: any) => ({
                value: e.id,
                label: `${e.name} (${e.asset_number})`,
              }))}
              operatorOptions={(operators ?? []).map((o: any) => ({
                value: o.id,
                label: o.full_name,
              }))}
              supplierOptions={(suppliers ?? []).map((s: any) => ({
                value: s.id,
                label: s.company_name,
              }))}
              purchaseOrderOptions={(purchaseOrders ?? []).map((po: any) => ({
                value: po.id,
                label: po.po_number,
              }))}
              title="Requested Equipment"
            />

            <div style={{ marginTop: 18 }}>
              <button type="submit" style={saveBtn}>
                Create booking
              </button>
            </div>
          </form>
        </div>
      </div>
    </ClientShell>
  );
}

function Field({ label, name, type = "text" }: any) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} type={type} style={inputStyle} />
    </div>
  );
}

function SelectField({ label, name, options }: any) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} style={inputStyle}>
        <option value="">— Select —</option>
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const cardStyle = { background: "white", padding: 20, borderRadius: 10 };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 };
const labelStyle = { fontSize: 12, fontWeight: 700 };
const inputStyle = { height: 40, padding: "0 10px", borderRadius: 6 };
const textareaStyle = { width: "100%", padding: 10, borderRadius: 6 };
const saveBtn = { padding: "10px 16px", background: "#111", color: "#fff", borderRadius: 6 };
const btnStyle = { padding: 10 };
const errorBox = { marginTop: 10, padding: 10, background: "#ffe5e5", borderRadius: 6 };
