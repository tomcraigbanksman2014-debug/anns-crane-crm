"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Customer = {
  id: string;
  company_name: string | null;
};

type Equipment = {
  id: string;
  name: string | null;
};

type Job = {
  id: string;
  client_id: string | null;
  equipment_id: string | null;
  site_name: string | null;
  site_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  job_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  hire_type: string | null;
  lift_type: string | null;
  notes: string | null;
};

export default function JobForm({
  mode,
  customers,
  equipment,
  job,
}: {
  mode: "create";
  customers: Customer[];
  equipment: Equipment[];
  job?: Job;
}) {
  const router = useRouter();

  const [clientId, setClientId] = useState(job?.client_id ?? "");
  const [equipmentId, setEquipmentId] = useState(job?.equipment_id ?? "");
  const [siteName, setSiteName] = useState(job?.site_name ?? "");
  const [siteAddress, setSiteAddress] = useState(job?.site_address ?? "");
  const [contactName, setContactName] = useState(job?.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(job?.contact_phone ?? "");
  const [jobDate, setJobDate] = useState(job?.job_date ?? new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(job?.start_time ?? "");
  const [endTime, setEndTime] = useState(job?.end_time ?? "");
  const [status, setStatus] = useState(job?.status ?? "draft");
  const [hireType, setHireType] = useState(job?.hire_type ?? "");
  const [liftType, setLiftType] = useState(job?.lift_type ?? "");
  const [notes, setNotes] = useState(job?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!jobDate) {
      setMsg("Job date is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId || null,
          equipment_id: equipmentId || null,
          site_name: siteName.trim() || null,
          site_address: siteAddress.trim() || null,
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
          job_date: jobDate || null,
          start_time: startTime || null,
          end_time: endTime || null,
          status: status || "draft",
          hire_type: hireType.trim() || null,
          lift_type: liftType.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error || "Could not save job.");
        return;
      }

      router.replace("/jobs");
      router.refresh();
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={card}>
      {msg && <div style={errorBox}>{msg}</div>}

      <div style={grid12}>
        <Field span={6} label="Customer">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={input}>
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name ?? "Unnamed customer"}
              </option>
            ))}
          </select>
        </Field>

        <Field span={6} label="Crane / equipment">
          <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} style={input}>
            <option value="">Select equipment</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name ?? "Unnamed equipment"}
              </option>
            ))}
          </select>
        </Field>

        <Field span={4} label="Job date *">
          <input type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Start time">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="End time">
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={input} />
        </Field>

        <Field span={6} label="Site name">
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} style={input} placeholder="e.g. Trafford Park Lift" />
        </Field>

        <Field span={6} label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>

        <Field span={12} label="Site address">
          <textarea
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
            style={textarea}
            placeholder="Full site address"
          />
        </Field>

        <Field span={6} label="Site contact name">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={input} />
        </Field>

        <Field span={6} label="Site contact phone">
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={input} />
        </Field>

        <Field span={6} label="Hire type">
          <input value={hireType} onChange={(e) => setHireType(e.target.value)} style={input} placeholder="e.g. CPA / Contract Lift" />
        </Field>

        <Field span={6} label="Lift type">
          <input value={liftType} onChange={(e) => setLiftType(e.target.value)} style={input} placeholder="e.g. Steel lift / Machinery move" />
        </Field>

        <Field span={12} label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={textarea}
            placeholder="Job notes"
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving} style={primaryBtn}>
          {saving ? "Saving..." : "Save job"}
        </button>

        <a href="/jobs" style={secondaryBtn}>
          Cancel
        </a>
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
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
  fontWeight: 800,
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

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 110,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
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

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
