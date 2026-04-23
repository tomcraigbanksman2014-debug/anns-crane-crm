import ClientShell from "../ClientShell";
import StaffPlannerBoard from "./StaffPlannerBoard";

export default function StaffPlannerPage() {
  return (
    <ClientShell>
      <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto" }}>
        <StaffPlannerBoard />
      </div>
    </ClientShell>
  );
}
