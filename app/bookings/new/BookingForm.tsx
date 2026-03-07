"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ClientRow = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
};

type EquipmentRow = {
  id: string;
  name: string | null;
  asset_number: string | null;
  type: string | null;
  capacity: string | null;
  status: string | null;
};

type BookingRow = {
  id: string;
  client_id: string | null;
  equipment_id: string | null;
  start_at?: string | null;
  end_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location: string | null;
  status: string | null;
  hire_price: number | null;
  vat: number | null;
  total_invoice: number | null;
  payment_received: number | null;
  invoice_status: string | null;
};

function toDateInputValue(iso?: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function toTimeInputValue(iso?: string | null) {
  if (!iso) return "";
  return iso.slice(11, 16);
}

function combineDateTime(date: string, time: string) {
  return `${date}T${time}:00`;
}

export default function BookingForm({
  mode,
  clients,
  equipment,
  booking,
}: {
  mode: "create" | "edit";
  clients: ClientRow[];
  equipment: EquipmentRow[];
  booking?: BookingRow;
}) {
  const router = useRouter();

  const [clientId, setClientId] = useState<string>(booking?.client_id ?? "");
  const [equipmentId, setEquipmentId] = useState<string>(booking?.equipment_id ?? "");

  const [startDate, setStartDate] = useState<string>(
    booking?.start_at ? toDateInputValue(booking.start_at) : booking?.start_date ?? ""
  );
  const [startTime, setStartTime] = useState<string>(
    booking?.start_at ? toTimeInputValue(booking.start_at) || "08:00" : "08:00"
  );

  const [endDate, setEndDate] = useState<string>(
    booking?.end_at ? toDateInputValue(booking.end_at) : booking?.end_date ?? ""
  );
  const [endTime, setEndTime] = useState<string>(
    booking?.end_at ? toTimeInputValue(booking.end_at) || "17:00" : "17:00"
  );

  const [location, setLocation] = useState<string>(booking?.location ?? "");
  const [status, setStatus] = useState<string>(booking?.status ?? "Inquiry");

  const [hirePrice, setHirePrice] = useState<string>(
    booking?.hire_price != null ? String(booking.hire_price) : ""
  );
  const [vatRate, setVatRate] = useState<string>("20");
  const [paymentReceived, setPaymentReceived] = useState<string>(
    booking?.payment_received != null ? String(booking.payment_received) : "0"
  );
  const [invoiceStatus, setInvoiceStatus] = useState<string>(
    booking?.invoice_status ?? "Not Invoiced"
  );

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const computed = useMemo(() => {
    const hp = Number(hirePrice || 0);
    const vr = Number(vatRate || 0);
    const vat = +(hp * (vr / 100)).toFixed(2);
    const total = +(hp + vat).toFixed(2);
    return { vat, total };
  }, [hirePrice, vatRate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!clientId || !equipmentId || !startDate || !startTime || !endDate || !endTime) {
      setMsg("Customer, equipment, start date/time and end date/time are required.");
      return;
    }

    const startAt = combineDateTime(startDate, startTime);
    const endAt = combineDateTime(endDate, endTime);

    if (new Date(endAt) <= new Date(startAt)) {
      setMsg("End date/time must be after start date/time.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        client_id: clientId,
        equipment_id: equipmentId,
        start_at: startAt,
        end_at: endAt,
        start_date: startDate,
        end_date: endDate,
        location: location || null,
        status,
        hire_price: hirePrice ? Number(hirePrice) : null,
        vat: hirePrice ? computed.vat : null,
        total_invoice: hirePrice ? computed.total : null,
        payment_received: paymentReceived ? Number(paymentReceived) : 0,
        invoice_status: invoiceStatus,
      };

      const url =
        mode === "create"
          ? "/api/bookings"
          : `/api/bookings/${encodeURIComponent(booking!.id)}`;

      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "Could not save booking.");
        return;
      }

      router.replace("/bookings");
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!booking?.id) return;
    if (!confirm("Delete this booking?")) return;

    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "Could not delete booking.");
        return;
      }
      router.replace("/bookings");
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={card}>
      <h1 style={{ margin: 0, fontSize: 32 }}>
        {mode === "create" ? "New Booking" : "Edit Booking"}
      </h1>

      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Same equipment can be used for multiple jobs on the same day as long as times do not overlap.
      </p>

      {msg && <div style={errorBox}>{msg}</div>}

      <div style={grid12}>
        <Field span={6} label="Customer *">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={input}>
            <option value="">Select customer…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.company_name || "Unnamed")}
                {c.contact_name ? ` — ${c.contact_name}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field span={6} label="Equipment *">
          <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} style={input}>
            <option value="">Select equipment…</option>
            {equipment.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name || "Unnamed"}
                {eq.asset_number ? ` — ${eq.asset_number}` : ""}
                {eq.capacity ? ` — ${eq.capacity}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field span={3} label="Start date *">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={input}
          />
        </Field>

        <Field span={3} label="Start time *">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={input}
          />
        </Field>

        <Field span={3} label="End date *">
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={input}
          />
        </Field>

        <Field span={3} label="End time *">
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={input}
          />
        </Field>

        <Field span={6} label="Location">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={input}
            placeholder="Site / address"
          />
        </Field>

        <Field span={6} label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
            <option>Inquiry</option>
            <option>Provisional</option>
            <option>Confirmed</option>
            <option>Completed</option>
            <option>Cancelled</option>
          </select>
        </Field>

        <Field span={4} label="Hire price">
          <input
            value={hirePrice}
            onChange={(e) => setHirePrice(e.target.value)}
            style={input}
            inputMode="decimal"
            placeholder="e.g. 1200"
          />
        </Field>

        <Field span={4} label="VAT %">
          <input
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            style={input}
            inputMode="decimal"
          />
        </Field>

        <Field span={4} label="Payment received">
          <input
            value={paymentReceived}
            onChange={(e) => setPaymentReceived(e.target.value)}
            style={input}
            inputMode="decimal"
            placeholder="0"
          />
        </Field>

        <Field span={6} label="Invoice status">
          <select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)} style={input}>
            <option>Not Invoiced</option>
            <option>Invoiced</option>
            <option>Part Paid</option>
            <option>Paid</option>
          </select>
        </Field>

        <div style={{ ...span6, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
          <div style={{ opacity: 0.85, fontSize: 15, paddingBottom: 8, fontWeight: 800 }}>
            VAT: {hirePrice ? computed.vat.toFixed(2) : "—"} &nbsp;|&nbsp; Total: {hirePrice ? computed.total.toFixed(2) : "—"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" disabled={loading} style={primaryBtn}>
          {loading ? "Saving..." : "Save booking"}
        </button>

        <a href="/bookings" style={secondaryBtn}>
          Cancel
        </a>

        {mode === "edit" && (
          <button type="button" onClick={onDelete} disabled={loading} style={dangerBtn}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span: number;
}) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const card: React.CSSProperties = {
  width: "min(1150px, 95vw)",
  margin: "0 auto",
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const grid12: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 12,
  marginTop: 12,
};

const span6: React.CSSProperties = {
  gridColumn: "span 6",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const input: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const dangerBtn: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,0,0,0.25)",
  background: "rgba(255,0,0,0.10)",
  color: "#b00020",
  fontWeight: 900,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
