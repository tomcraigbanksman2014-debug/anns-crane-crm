import ClientShell from "../../ClientShell";
import EquipmentForm from "./EquipmentForm";

export default function NewEquipmentPage() {
  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>Add equipment</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          Add a new crane / HIAB / trailer / accessory.
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
          <EquipmentForm mode="create" />
        </div>

        <div style={{ marginTop: 14 }}>
          <a
            href="/equipment"
            style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}
          >
            ← Back to equipment
          </a>
        </div>
      </div>
    </ClientShell>
  );
}
