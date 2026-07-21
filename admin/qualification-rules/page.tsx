"use client";

import { useEffect, useMemo, useState } from "react";
import ClientShell from "../../ClientShell";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type QualificationRule = {
  id: string;
  role: string;
  qualification_name: string;
  validity_value: number | null;
  validity_unit: "days" | "months" | "years" | null;
  warning_days: number;
  is_active: boolean;
};

const emptyForm = {
  role: "",
  qualification_name: "",
  validity_value: "",
  validity_unit: "years",
  warning_days: "30",
  is_active: true,
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

export default function QualificationRulesPage() {
  const supabase = createSupabaseBrowserClient();

  const [rules, setRules] = useState<QualificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorised, setAuthorised] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<any>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/qualification-rules", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(json?.error || "Could not load qualification rules.");
        return;
      }

      setRules(json?.rules ?? []);
    } catch {
      setMessage("Could not load qualification rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      const { data, error } = await supabase.auth.getUser();

      if (!mounted) return;

      if (error || !data.user) {
        window.location.href = "/login";
        return;
      }

      const user = data.user;
      const email = String(user.email ?? "").trim().toLowerCase();
      const masterAdminEmail = String(
        process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ?? ""
      )
        .trim()
        .toLowerCase();

      const metadataRole = String(user.user_metadata?.role ?? "").toLowerCase();
      const usernameFromEmail = fromAuthEmail(user.email ?? null).toLowerCase();

      const isMaster = !!email && !!masterAdminEmail && email === masterAdminEmail;
      const isAdmin = isMaster || metadataRole === "admin";

      if (!isAdmin) {
        const { data: operators } = await supabase
          .from("operators")
          .select("full_name, email, status")
          .eq("status", "active");

        const matchedOperator =
          (operators ?? []).find((op: any) => {
            const operatorEmail = String(op.email ?? "").trim().toLowerCase();
            const operatorName = String(op.full_name ?? "").trim().toLowerCase();

            return (
              (!!operatorEmail && operatorEmail === email) ||
              (!!operatorName && operatorName === usernameFromEmail)
            );
          }) ?? null;

        if (matchedOperator || metadataRole === "staff") {
          window.location.href = "/";
          return;
        }
      }

      setAuthorised(true);
      await load();
    }

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const grouped = useMemo(() => {
    const map = new Map<string, QualificationRule[]>();

    for (const rule of rules) {
      const key = String(rule.role ?? "No role");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rule);
    }

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rules]);

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        role: String(form.role ?? "").trim(),
        qualification_name: String(form.qualification_name ?? "").trim(),
        validity_value: form.validity_value ? Number(form.validity_value) : null,
        validity_unit: form.validity_unit || null,
        warning_days: Number(form.warning_days ?? 30),
        is_active: !!form.is_active,
      };

      const res = await fetch("/api/admin/qualification-rules", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(json?.error || "Could not save qualification rule.");
        return;
      }

      setForm(emptyForm);
      setEditingId(null);
      await load();
      setMessage(editingId ? "Qualification rule updated." : "Qualification rule added.");
    } catch {
      setMessage("Could not save qualification rule.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id: string) {
    const confirmed = window.confirm("Delete this qualification rule?");
    if (!confirmed) return;

    setMessage("");

    try {
      const res = await fetch("/api/admin/qualification-rules", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessage(json?.error || "Could not delete qualification rule.");
        return;
      }

      await load();
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm);
      }
      setMessage("Qualification rule deleted.");
    } catch {
      setMessage("Could not delete qualification rule.");
    }
  }

  function startEdit(rule: QualificationRule) {
    setEditingId(rule.id);
    setForm({
      role: rule.role ?? "",
      qualification_name: rule.qualification_name ?? "",
      validity_value: rule.validity_value != null ? String(rule.validity_value) : "",
      validity_unit: rule.validity_unit ?? "years",
      warning_days: String(rule.warning_days ?? 30),
      is_active: !!rule.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1240px, 95vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Qualification Rules</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Manage required qualifications, renewal lengths and warning windows inside the CRM.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/dashboard" style={secondaryBtn}>
                ← Back to dashboard
              </a>
              <a href="/operators" style={secondaryBtn}>
                Open operators
              </a>
            </div>
          </div>

          {!authorised ? (
            <div style={emptyBox}>Checking access...</div>
          ) : (
            <>
              {message ? <div style={infoBox}>{message}</div> : null}

              <section style={sectionCard}>
                <h2 style={sectionTitle}>
                  {editingId ? "Edit qualification rule" : "Add qualification rule"}
                </h2>

                <form onSubmit={submitForm} style={{ display: "grid", gap: 12 }}>
                  <div style={grid5}>
                    <Field
                      label="Role"
                      value={form.role}
                      onChange={(value) => setForm((prev: any) => ({ ...prev, role: value }))}
                      placeholder="e.g. Crane Operator"
                    />
                    <Field
                      label="Qualification name"
                      value={form.qualification_name}
                      onChange={(value) => setForm((prev: any) => ({ ...prev, qualification_name: value }))}
                      placeholder="e.g. CPCS"
                    />
                    <Field
                      label="Validity value"
                      value={form.validity_value}
                      onChange={(value) => setForm((prev: any) => ({ ...prev, validity_value: value }))}
                      placeholder="e.g. 5"
                      type="number"
                    />
                    <SelectField
                      label="Validity unit"
                      value={form.validity_unit}
                      onChange={(value) => setForm((prev: any) => ({ ...prev, validity_unit: value }))}
                      options={[
                        { value: "days", label: "days" },
                        { value: "months", label: "months" },
                        { value: "years", label: "years" },
                      ]}
                    />
                    <Field
                      label="Warning days"
                      value={form.warning_days}
                      onChange={(value) => setForm((prev: any) => ({ ...prev, warning_days: value }))}
                      placeholder="30"
                      type="number"
                    />
                  </div>

                  <label style={checkWrap}>
                    <input
                      type="checkbox"
                      checked={!!form.is_active}
                      onChange={(e) => setForm((prev: any) => ({ ...prev, is_active: e.target.checked }))}
                    />
                    Rule is active
                  </label>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="submit" disabled={saving} style={primaryBtn}>
                      {saving ? "Saving..." : editingId ? "Save rule" : "Add rule"}
                    </button>

                    {editingId ? (
                      <button type="button" onClick={cancelEdit} style={secondaryButtonElement}>
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                </form>
              </section>

              <section style={{ ...sectionCard, marginTop: 16 }}>
                <h2 style={sectionTitle}>Existing rules</h2>

                {loading ? (
                  <div style={emptyBox}>Loading qualification rules...</div>
                ) : rules.length === 0 ? (
                  <div style={emptyBox}>No qualification rules added yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 16 }}>
                    {grouped.map(([role, items]) => (
                      <div key={role} style={roleCard}>
                        <div style={{ fontWeight: 1000, fontSize: 18 }}>{role}</div>

                        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                          {items.map((rule) => (
                            <div key={rule.id} style={ruleRow}>
                              <div>
                                <div style={{ fontWeight: 900 }}>{rule.qualification_name}</div>
                                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                                  Validity: {rule.validity_value && rule.validity_unit ? `${rule.validity_value} ${rule.validity_unit}` : "Manual expiry"} • Warning: {rule.warning_days} day(s) • {rule.is_active ? "Active" : "Inactive"}
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => startEdit(rule)}
                                  style={miniBtn}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteRule(rule.id)}
                                  style={dangerBtn}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        style={inputStyle}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.24)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const grid5: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 12,
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

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
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
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const secondaryButtonElement: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};

const infoBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.20)",
  color: "#0b57d0",
  fontWeight: 800,
};

const emptyBox: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const roleCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const ruleRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.52)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const miniBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.80)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  color: "#8b0000",
  fontWeight: 900,
  border: "1px solid rgba(255,0,0,0.20)",
  cursor: "pointer",
};

const checkWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 800,
};
