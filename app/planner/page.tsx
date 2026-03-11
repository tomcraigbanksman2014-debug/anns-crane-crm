import ClientShell from "../ClientShell";
import PlannerBoard from "./PlannerBoard";

export default function PlannerPage() {
  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <PlannerBoard />
      </div>
    </ClientShell>
  );
}
