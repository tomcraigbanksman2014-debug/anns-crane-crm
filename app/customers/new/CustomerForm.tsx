"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type Customer = {
  id?: string;
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export default function CustomerForm({
  mode,
  customer,
}: {
  mode: "create" | "edit";
  customer?: Customer | null;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [companyName, setCompanyName] = useState(customer?.company_name ?? "");
  const [contactName, setContactName] = useState(customer?.contact_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If customer loads later (edit page), hydrate fields once
  useEffect(() => {
    if (mode === "edit" && customer) {
      setCompanyName(customer.company_name ?? "");
      setContactName(customer.contact_name ?? "");
      setPhone(customer.phone ?? "");
      setEmail(customer.email ?? "");
      setNotes(customer.notes ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, customer?.id]);

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
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      };

      if (mode === "create") {
        // ✅ IMPORTANT: send the access token to your API route
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        if (!token) {
          throw new Error("Not authenticated");
        }

        const res = await fetch("/api/customers/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to save customer");
        }

        router.push("/customers");
        router.refresh();
        return;
      }

      // mode === "edit"
      if (!customer?.id) {
        throw new Error("Missing customer ID");
      }

      // ✅ Edit uses browser Supabase directly (simpler + works with RLS)
      const { error: updErr } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", customer.id);

      if (updErr) throw new Error(updErr.message);

      router.push(`/customers/${customer.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={labelStyle}>
          Company name <span style={{ color: "#b00020" }}>*</span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Ann Crane Hire Ltd"
          />
        </label>

        <label style={labelStyle}>
          Contact name
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Tom Craig"
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
              placeholder="e.g. 01792..."
            />
          </label>

          <label style={labelStyle}>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="e.g. admin@..."
            />
          </label>
        </div>

        <label style={labelStyle}>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
            placeholder="Notes"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: 8,
            padding: "14px 14px",
            borderRadius: 12,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : "Save customer"}
        </button>

        {error && (
          <div
            style={{
              marginTop: 4,
              padding: "10px 12px",
              borderRadius: 10,
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
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  background: "rgba(240,248,255,0.75)",
  fontSize: 14,
};
