import ClientShell from "../ClientShell";
import PlannerBoard from "./PlannerBoard";

export default function PlannerPage() {
  return (
    <ClientShell>
      <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto" }}>
        <PlannerBoard />
      </div>
    </ClientShell>
  );
}
