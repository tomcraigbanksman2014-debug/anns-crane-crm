"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type ClientRow = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
};

type EquipmentRow = {
  id: string;
  name: string | null;
  asset_number: string | null;
  capacity: string | null;
  status: string | null;
};

export default function BookingForm({
  mode,
  bookingId,
}: {
  mode: "create" | "edit";
  bookingId?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);

  const [clientId, setClientId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");

  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD
  const [location, setLocation] = useState("");

  const [status, setStatus] = useState("Inquiry");
  const [invoiceStatus, setInvoiceStatus] = useState("Not Invoiced");

  const [hirePrice, setHirePrice] = useState(""); // numeric string
  const [paymentReceived, setPaymentReceived] = useState("0"); // numeric string

  const [loading, setLoading] = useState(false);
  const [loadingLists, setLoadingLists] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingLists(true);
      try {
        const [cRes, eRes] = await Promise.all([
          supabase
            .from("clients")
            .select("id, company_name, contact_name")
            .order("company_name", { ascending: true })
            .limit(500),
          supabase
            .from("equipment")
            .select("id, name, asset_number, capacity, status")
            .order("name", { ascending: true })
            .limit(500),
        ]);

        if (cRes.error) throw new Error(cRes.error.message);
        if (eRes.error) throw new Error(eRes.error.message);

        setClients((cRes.data ?? []) as any);
        setEquipment((eRes.data ?? []) as any);
      } catch (e: any) {
        setError(e?.message || "Failed to load dropdown lists");
      } finally {
        setLoadingLists(false);
      }
    })();
  }, [supabase]);

  function validate() {
    if (!clientId) return "Select a customer";
    if (!equipmentId) return "Select equipment";
    if (!startDate) return "Start date is required";
    if (!endDate) return "End date is required";
    if (endDate < startDate) return "End date cannot be before start date";
    const hp = hirePrice.trim();
    if (!hp) return "Hire price is required";
    const hpNum = Number(hp);
    if (Number.isNaN(hpNum) || hpNum < 0) return "Hire price must be a valid number";
    const prNum = Number(paymentReceived.trim() || "0");
    if (Number.isNaN(prNum) || prNum < 0) return "Payment received must be a valid number";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setLoading(true);
    try {
      // IMPORTANT: send token so staff can write reliably
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const payload = {
        client_id: clientId,
        equipment_id: equipmentId,
        start_date: startDate,
        end_date: endDate,
        location: location.trim() || null,
        status,
        invoice_status: invoiceStatus,
        hire_price: Number(hirePrice),
        payment_received: Number(paymentReceived || "0"),
      };

      const url =
        mode === "edit" && bookingId
          ? `/api/bookings/${bookingId}`
          : `/api/bookings/create`;

      const method = mode === "edit" && bookingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save booking");

      // Go to bookings list (or booking view if you prefer)
      router.push("/bookings");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save booking");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ display: "grid", gap: 12 }}>
        {loadingLists ? (
          <div style={{ opacity: 0.8 }}>Loading customers & equipment…</div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Customer <span style={{ color: "#b00020" }}>*</span>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={inputStyle}>
              <option value="">Select customer…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.company_name ?? "(No company)") + (c.contact_name ? ` — ${c.contact_name}` : "")}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Equipment <span style={{ color: "#b00020" }}>*</span>
            <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} style={inputStyle}>
              <option value="">Select equipment…</option>
              {equipment.map((x) => (
                <option key={x.id} value={x.id}>
                  {(x.name ?? "(No name)") +
                    (x.asset_number ? ` — ${x.asset_number}` : "") +
                    (x.capacity ? ` — ${x.capacity}` : "") +
                    (x.status ? ` — ${x.status}` : "")}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Start date <span style={{ color: "#b00020" }}>*</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            End date <span style={{ color: "#b00020" }}>*</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </label>
        </div>

        <label style={labelStyle}>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} placeholder="Site / address" />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
              <option value="Inquiry">Inquiry</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>

          <label style={labelStyle}>
            Invoice status
            <select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)} style={inputStyle}>
              <option value="Not Invoiced">Not Invoiced</option>
              <option value="Invoiced">Invoiced</option>
              <option value="Paid">Paid</option>
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Hire price <span style={{ color: "#b00020" }}>*</span>
            <input
              value={hirePrice}
              onChange={(e) => setHirePrice(e.target.value)}
              style={inputStyle}
              placeholder="e.g. 900"
              inputMode="decimal"
            />
          </label>

          <label style={labelStyle}>
            Payment received
            <input
              value={paymentReceived}
              onChange={(e) => setPaymentReceived(e.target.value)}
              style={inputStyle}
              placeholder="0"
              inputMode="decimal"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px 14px",
            borderRadius: 12,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            background: "linear-gradient(180deg, #111, #000)",
            color: "white",
            fontWeight: 900,
          }}
        >
          {loading ? "Saving..." : "Save booking"}
        </button>

        {error && (
          <div
            style={{
              padding: "12px 12px",
              borderRadius: 12,
              background: "rgba(255,0,0,0.10)",
              border: "1px solid rgba(255,0,0,0.25)",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  outline: "none",
  fontSize: 14,
};
