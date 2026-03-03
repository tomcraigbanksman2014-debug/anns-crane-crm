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
  start_date: string;
  end_date: string;
  location: string | null;
  status: string | null;
  hire_price: number | null;
  vat: number | null;
  total_invoice: number | null;
  payment_received: number | null;
  invoice_status: string | null;
};

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
  const [startDate, setStartDate] = useState<string>(booking?.start_date ?? "");
  const [endDate, setEndDate] = useState<string>(booking?.end_date ?? "");
  const [location, setLocation] = useState<string>(booking?.location ?? "");
  const [status, setStatus] = useState<string>(booking?.status ?? "Inquiry");

  const [hirePrice, setHirePrice] = useState<string>(
    booking?.hire_price != null ? String(booking.hire_price) : ""
  );
  const [vatRate, setVatRate] = useState<string>("20"); // percent
  const [paymentReceived, setPaymentReceived] = useState<string>(
    booking?.payment_received != null ? String(booking.payment_received) : "0"
  );
  const [invoiceStatus, setInvoiceStatus] = useState<string>(booking?.invoice_status ?? "Not Invoiced");

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

    if (!clientId || !equipmentId || !startDate || !endDate) {
      setMsg("Customer, equipment, start date and end date are required.");
      return;
    }

    if (endDate < startDate) {
      setMsg("End date must be the same as or after start date.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        client_id: clientId,
        equipment_id: equipmentId,
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
        mode === "create" ? "/api/bookings" : `/api/bookings/${encodeURIComponent(booking!.id)}`;
      const method = mode === "create" ? "POST" : "PUT";

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
      <h1 style={{ margin: 0, fontSize: 32 }}>{mode === "create" ? "New Booking" : "Edit Booking"}</h1>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Link a customer + equipment + dates. Double bookings are blocked automatically.
      </p>

      {msg && <div style={errorBox}>{msg}</div>}

      <div style={grid2}>
        <div>
          <label style={label}>Customer *</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={input}>
            <option value="">Select customer…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.company_name || "Unnamed")} {c.contact_name ? `— ${c.contact_name}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={label}>Equipment *</label>
          <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} style={input}>
            <option value="">Select equipment…</option>
            {equipment.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {(eq.name || "Unnamed")}
                {eq.asset_number ? ` — ${eq.asset_number}` : ""}
                {eq.capacity ? ` — ${eq.capacity}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={grid2}>
        <div>
          <label style={label}>Start date *</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={input} />
        </div>

        <div>
          <label style={label}>End date *</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={input} />
        </div>
      </div>

      <div style={grid2}>
        <div>
          <label style={label}>Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} style={input} placeholder="Site / address" />
        </div>

        <div>
          <label style={label}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
            <option>Inquiry</option>
            <option>Provisional</option>
            <option>Confirmed</option>
            <option>Completed</option>
            <option>Cancelled</option>
          </select>
        </div>
      </div>

      <div style={grid3}>
        <div>
          <label style={label}>Hire price</label>
          <input
            value={hirePrice}
            onChange={(e) => setHirePrice(e.target.value)}
            style={input}
            inputMode="decimal"
            placeholder="e.g. 1200"
          />
        </div>

        <div>
          <label style={label}>VAT %</label>
          <input value={vatRate} onChange={(e) => setVatRate(e.target.value)} style={input} inputMode="decimal" />
        </div>

        <div>
          <label style={label}>Payment received</label>
          <input
            value={paymentReceived}
            onChange={(e) => setPaymentReceived(e.target.value)}
            style={input}
            inputMode="decimal"
            placeholder="0"
          />
        </div>
      </div>

      <div style={grid2}>
        <div>
          <label style={label}>Invoice status</label>
          <select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)} style={input}>
            <option>Not Invoiced</option>
            <option>Invoiced</option>
            <option>Part Paid</option>
            <option>Paid</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", justifyContent: "flex-end" }}>
          <div style={{ opacity: 0.85, fontSize: 13, paddingBottom: 8 }}>
            VAT: <b>{hirePrice ? computed.vat.toFixed(2) : "—"}</b> &nbsp;|&nbsp; Total:{" "}
            <b>{hirePrice ? computed.total.toFixed(2) : "—"}</b>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
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

const card: React.CSSProperties = {
  width: "min(1100px, 95vw)",
  margin: "0 auto",
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const label: React.CSSProperties = { display: "block", fontSize: 12, marginBottom: 6, opacity: 0.85 };
const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
};

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 };

const primaryBtn: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const dangerBtn: React.CSSProperties = {
  padding: "12px 14px",
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
