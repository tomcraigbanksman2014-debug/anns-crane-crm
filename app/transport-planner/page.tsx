import ClientShell from "../ClientShell";
import TransportPlannerBoard from "./TransportPlannerBoard";

export default function TransportPlannerPage() {
  return (
    <ClientShell>
      <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto" }}>
        <TransportPlannerBoard />
      </div>
    </ClientShell>
  );
}
