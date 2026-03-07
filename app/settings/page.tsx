import ClientShell from "../ClientShell";

export default function SettingsPage() {
  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>Settings</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          Manage system settings for AnnS Crane CRM.
        </p>

        <div
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,0.18)",
            padding: 18,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.4)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          }}
        >
          <h3>System</h3>

          <div style={{ marginTop: 12 }}>
            <a href="/dashboard" style={btn}>
              ← Back to dashboard
            </a>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

const btn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};
