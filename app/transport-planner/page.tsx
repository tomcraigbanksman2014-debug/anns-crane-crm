import ClientShell from "../ClientShell";
import TransportPlannerBoard from "./TransportPlannerBoard";

export default function TransportPlannerPage() {
  return (
    <ClientShell>
      <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto", display: "grid", gap: 12 }}>
        <div style={toolbarStyle}>
          <div style={{ fontWeight: 800, opacity: 0.75 }}>Quick actions</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href="/transport-jobs/new" style={primaryBtn}>+ Add Transport Job</a>
            <a href="/jobs/new" style={secondaryBtn}>+ Add Job</a>
          </div>
        </div>
        <TransportPlannerBoard />
      </div>
    </ClientShell>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  border: "none",
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
