"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ClientShell from "../../../ClientShell";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";

type Opt = { id: string; label: string };

function toDateInput(v: string | null | undefined) {
  if (!v) return "";
  // DB stores date, but sometimes comes as ISO. Keep first 10 chars.
  return String(v).slice(0, 10);
}

export default function BookingEditPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const bookingId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [clients, setClients] = useState<Opt[]>([]);
  const [equipment, setEquipment] = useState<Opt[]>([]);

  const [clientId, setClientId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("Inquiry");
  const [hirePrice, setHirePrice] = useState<string>("");
  const [paymentReceived, setPaymentReceived] = useState<string>("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMsg(null);

      const [{ data: bookingRes, error: bookingErr }, { data: cRes }, { data: eRes }] =
        await Promise.all([
          supabase
            .from("bookings")
            .select(
              "id, client_id, equipment_id, start_date, end_date, location, status, hire_price, payment_received"
            )
            .eq("id", bookingId)
            .single(),
          supabase
            .from("clients")
            .select("id, company_name, contact_name")
            .order("created_at", { ascending: false }),
          supabase
            .from("equipment")
            .select("id, name, asset_number")
            .order("created_at", { ascending: false }),
        ]);

      if (bookingErr || !bookingRes) {
        setMsg(bookingErr?.message || "Booking not found");
        setLoading(false);
        return;
      }

      setClientId(bookingRes.client_id ?? "");
      setEquipmentId(bookingRes.equipment_id ?? "");
      setStartDate(toDateInput(bookingRes.start_date));
      setEndDate(toDateInput(bookingRes.end_date));
      setLocation(bookingRes.location ?? "");
      setStatus(bookingRes.status ?? "Inquiry");
      setHirePrice(bookingRes.hire_price?.toString?.() ?? "");
      setPaymentReceived(bookingRes.payment_received?.toString?.() ?? "");

      setClients(
        (cRes ?? []).map((c: any) => ({
          id: c.id,
          label: c.company_name || c.contact_name || c.id,
        }))
      );

      setEquipment(
        (eRes ?? []).map((e: any) => ({
          id: e.id,
          label: `${e.name ?? "Equipment"}${e.asset_number ? ` (${e.asset_number})` : ""}`,
        }))
      );

      setLoading(false);
    }

    load();
  }, [supabase, bookingId]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId || null,
          equipment_id: equipmentId || null,
          start_date: startDate || null,
          end_date: endDate || null,
          location: location || null,
          status: status || null,
          hire_price: hirePrice === "" ? null : Number(hirePrice),
          payment_received: paymentReceived === "" ? null : Number(paymentReceived),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "Failed to save booking");
        return;
      }

      router.replace(`/bookings/${bookingId}`);
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ClientShell>
      <div style={{ width: "min(900px, 92vw)", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit booking</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Update booking details.</p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <a href={`/bookings/${bookingId}`} style={pillStyle}>
              ← Back
            </a>
          </div>
        </div>

        <div style={panelStyle}>
          {msg && <div style={errorStyle}>{msg}</div>}

          {loading ? (
            <p style={{ margin: 0 }}>Loading…</p>
          ) : (
            <form onSubmit={onSave}>
              <div style={gridStyle}>
                <Field label="Customer">
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={inputStyle}>
                    <option value="">Select customer…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Equipment">
                  <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} style={inputStyle}>
                    <option value="">Select equipment…</option>
                    {equipment.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Start date">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
                </Field>

                <Field label="End date">
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
                </Field>

                <Field label="Location">
                  <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} placeholder="Site / address" />
                </Field>

                <Field label="Status">
                  <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                    <option>Inquiry</option>
                    <option>Provisional</option>
                    <option>Confirmed</option>
                    <option>Completed</option>
                    <option>Cancelled</option>
                  </select>
                </Field>

                <Field label="Hire price (£)">
                  <input
                    type="number"
                    step="0.01"
                    value={hirePrice}
                    onChange={(e) => setHirePrice(e.target.value)}
                    style={inputStyle}
                    placeholder="0.00"
                  />
                </Field>

                <Field label="Payment received (£)">
                  <input
                    type="number"
                    step="0.01"
                    value={paymentReceived}
                    onChange={(e) => setPaymentReceived(e.target.value)}
                    style={inputStyle}
                    placeholder="0.00"
                  />
                </Field>
              </div>

              <button type="submit" disabled={saving} style={buttonStyle}>
                {saving ? "Saving…" : "Save booking"}
              </button>
            </form>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85 }}>{label}</div>
      {children}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "rgba(255,255,255,0.85)",
  outline: "none",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorStyle: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
