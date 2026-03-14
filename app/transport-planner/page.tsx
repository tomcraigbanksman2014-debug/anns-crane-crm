import ClientShell from "../ClientShell";
import TransportPlannerBoard from "./TransportPlannerBoard";

export default function TransportPlannerPage() {
  return (
    <ClientShell>
      <div style={{ width: "min(1500px, 99vw)", margin: "0 auto" }}>
        <TransportPlannerBoard />
      </div>
    </ClientShell>
  );
}
