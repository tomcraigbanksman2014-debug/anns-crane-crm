"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";

type Lead = {
  id?: string;
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  area?: string | null;
  industry?: string | null;
  lead_source?: string | null;
  status?: string | null;
  services?: string[] | null;
  notes?: string | null;
  lead_score?: number | null;
  do_not_contact?: boolean | null;
  next_follow_up_on?: string | null;
  last_contacted_at?: string | null;
  assigned_to_username?: string | null;
  converted_client_id?: string | null;
  archived?: boolean | null;
};

const STATUS_OPTIONS = [
  "New",
  "To Contact",
  "Contacted",
  "Quoted",
  "Follow Up",
  "Won",
  "Lost",
  "Dormant",
];

function localDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

function servicesToText(services: string[] | null | undefined) {
  return (services ?? []).join(", ");
}

function servicesFromText(value: string) {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function LeadForm({
  mode,
  lead,
}: {
  mode: "create" | "edit";
  lead?: Lead | null;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [companyName, setCompanyName] = useState(lead?.company_name ?? "");
  const [contactName, setContactName] = useState(lead?.contact_name ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [address, setAddress] = useState(lead?.address ?? "");
  const [area, setArea] = useState(lead?.area ?? "");
  const [industry, setIndustry] = useState(lead?.industry ?? "");
  const [leadSource, setLeadSource] = useState(lead?.lead_source ?? "");
  const [status, setStatus] = useState(lead?.status ?? "New");
  const [servicesText, setServicesText] = useState(servicesToText(lead?.services));
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [leadScore, setLeadScore] = useState(String(lead?.lead_score ?? 0));
  const [doNotContact, setDoNotContact] = useState(Boolean(lead?.do_not_contact));
  const [nextFollowUpOn, setNextFollowUpOn] = useState(String(lead?.next_follow_up_on ?? ""));
  const [lastContactedAt, setLastContactedAt] = useState(localDateInputValue(lead?.last_contacted_at));
  const [assignedToUsername, setAssignedToUsername] = useState(lead?.assigned_to_username ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "edit" && lead) {
      setCompanyName(lead.company_name ?? "");
      setContactName(lead.contact_name ?? "");
      setEmail(lead.email ?? "");
      setPhone(lead.phone ?? "");
      setAddress(lead.address ?? "");
      setArea(lead.area ?? "");
      setIndustry(lead.industry ?? "");
      setLeadSource(lead.lead_source ?? "");
      setStatus(lead.status ?? "New");
      setServicesText(servicesToText(lead.services));
      setNotes(lead.notes ?? "");
      setLeadScore(String(lead.lead_score ?? 0));
      setDoNotContact(Boolean(lead.do_not_contact));
      setNextFollowUpOn(String(lead.next_follow_up_on ?? ""));
      setLastContactedAt(localDateInputValue(lead.last_contacted_at));
      setAssignedToUsername(lead.assigned_to_username ?? "");
    }
  }, [mode, lead]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const company_name = companyName.trim();
    if (!company_name) {
      setError("Company name is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        company_name,
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        area: area.trim() || null,
        industry: industry.trim() || null,
        lead_source: leadSource.trim() || null,
        status: status || "New",
        services: servicesFromText(servicesText),
        notes: notes.trim() || null,
        lead_score: Number(leadScore || 0),
        do_not_contact: doNotContact,
        next_follow_up_on: nextFollowUpOn || null,
        last_contacted_at: lastContactedAt ? new Date(lastContactedAt).toISOString() : null,
        assigned_to_username: assignedToUsername.trim() || null,
      };

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      if (!token) throw new Error("Not authenticated");

      if (mode === "create") {
        const res = await fetch("/api/sales-leads/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to save lead");
        }

        router.push(`/sales-hub/leads/${data?.id ?? ""}`);
        router.refresh();
        return;
      }

      if (!lead?.id) throw new Error("Missing lead ID");

      const res = await fetch(`/api/sales-leads/${lead.id}/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to update lead");
      }

      router.push(`/sales-hub/leads/${lead.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to save lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={card}>
      <h1 style={{ margin: 0, fontSize: 32 }}>
        {mode === "create" ? "Add lead" : "Edit lead"}
      </h1>

      <p style={{ marginTop: 6, opacity: 0.8 }}>
        {mode === "create"
          ? "Create a new potential customer record."
          : "Update lead details and follow-up information."}
      </p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={grid12}>
        <Field span={8} label="Company name *">
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
            {STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>

        <Field span={6} label="Contact name">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={input} />
        </Field>

        <Field span={3} label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={input} />
        </Field>

        <Field span={3} label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Area / Town">
          <input value={area} onChange={(e) => setArea(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Industry">
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Lead source">
          <input value={leadSource} onChange={(e) => setLeadSource(e.target.value)} style={input} placeholder="e.g. LinkedIn, cold list, referral" />
        </Field>

        <Field span={4} label="Assigned to">
          <input value={assignedToUsername} onChange={(e) => setAssignedToUsername(e.target.value)} style={input} placeholder="e.g. tom" />
        </Field>

        <Field span={4} label="Next follow-up">
          <input type="date" value={nextFollowUpOn} onChange={(e) => setNextFollowUpOn(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Last contacted">
          <input type="datetime-local" value={lastContactedAt} onChange={(e) => setLastContactedAt(e.target.value)} style={input} />
        </Field>

        <Field span={4} label="Lead score">
          <input type="number" min="0" max="100" value={leadScore} onChange={(e) => setLeadScore(e.target.value)} style={input} />
        </Field>

        <Field span={12} label="Address">
          <input value={address} onChange={(e) => setAddress(e.target.value)} style={input} />
        </Field>

        <Field span={12} label="Services of interest">
          <textarea
            value={servicesText}
            onChange={(e) => setServicesText(e.target.value)}
            style={textarea}
            placeholder="e.g. Crane hire, HIAB transport, contract lift, spider crane"
          />
        </Field>

        <Field span={12} label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={textarea} />
        </Field>
      </div>

      <label style={checkboxRow}>
        <input type="checkbox" checked={doNotContact} onChange={(e) => setDoNotContact(e.target.checked)} />
        <span>Do not contact</span>
      </label>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving} style={primaryBtn}>
          {saving ? "Saving..." : mode === "edit" ? "Save changes" : "Save lead"}
        </button>

        <a href="/sales-hub/leads" style={secondaryBtn}>
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

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 120,
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
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};

const checkboxRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  marginTop: 16,
  fontWeight: 700,
};
