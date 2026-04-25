import ClientShell from "../ClientShell";
import DailyLogClient from "./DailyLogClient";

export default function DailyLogPage() {
  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <DailyLogClient />
      </div>
    </ClientShell>
  );
}
