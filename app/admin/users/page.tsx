import ClientShell from "../../ClientShell";
import AdminUsersForm from "./AdminUsersForm";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function AdminUsersPage() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const username = user?.email ? user.email.split("@")[0] : "";
  const role = (user?.user_metadata as any)?.role ?? "";

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
            <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Staff accounts</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Signed in as <b>{username}</b> ({role})
            </p>
          </div>

          <a href="/dashboard" style={btnStyle}>
            ← Back to dashboard
          </a>
        </div>

        <div style={{ marginTop: 16 }}>
          <AdminUsersForm />
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
