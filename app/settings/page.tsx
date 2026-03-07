import ClientShell from "../ClientShell";
import SettingsForm from "./SettingsForm";
import { createSupabaseServerClient } from "../lib/supabase/server";

export default async function SettingsPage() {
  const supabase = createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  const role = (auth.user?.user_metadata as any)?.role ?? "";

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

        {role !== "admin" ? (
          <div style={errorBox}>
            Admin access only.
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <SettingsForm settings={settingsRow ?? null} />
          </div>
        )}
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

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
