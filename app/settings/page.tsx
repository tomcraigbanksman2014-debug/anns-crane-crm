import ClientShell from "../ClientShell";
import SettingsForm from "./SettingsForm";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { requireAdmin } from "../lib/routeGuards";

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Settings</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Business, invoice and system settings.
            </p>
          </div>

          <a href="/dashboard" style={btnStyle}>
            ← Back
          </a>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/settings/exports" style={btnStyle}>Exports</a>
          <a href="/settings/data-cleanup" style={btnStyle}>Data cleanup</a>
          <a href="/settings/system-health" style={btnStyle}>System health</a>
        </div>

        <div style={{ marginTop: 16 }}>
          <SettingsForm settings={settingsRow ?? null} />
        </div>
      </div>
    </ClientShell>
  );
}

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};
