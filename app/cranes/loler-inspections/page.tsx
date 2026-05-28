import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import LolerInspectionManager from "./LolerInspectionManager";

function isMissingLolerTable(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("crane_loler_inspection") || message.includes("does not exist") || message.includes("schema cache");
}

export default async function LolerInspectionsPage() {
  const supabase = createSupabaseServerClient();

  const { data: cranes, error: cranesError } = await supabase
    .from("cranes")
    .select("id, name, reg_number, fleet_number, loler_due_on, last_loler_completed_on, loler_notes, archived")
    .or("archived.is.null,archived.eq.false")
    .order("name", { ascending: true });

  const { data: runs, error: runsError } = await supabase
    .from("crane_loler_inspection_runs")
    .select("id, title, start_date, end_date, inspector_company, inspector_name, notes, archived, created_at, updated_at")
    .eq("archived", false)
    .order("start_date", { ascending: false })
    .limit(50);

  let items: any[] = [];
  let setupRequired = false;
  const loadErrors: string[] = [];

  if (cranesError) loadErrors.push(cranesError.message);

  if (runsError) {
    if (isMissingLolerTable(runsError)) {
      setupRequired = true;
      loadErrors.push("LOLER inspection tables are not available yet. Run the LOLER SQL before using this page.");
    } else {
      loadErrors.push(runsError.message);
    }
  }

  const runIds = (runs ?? []).map((row: any) => String(row?.id ?? "")).filter(Boolean);

  if (!setupRequired && runIds.length > 0) {
    const { data: itemRows, error: itemError } = await supabase
      .from("crane_loler_inspection_items")
      .select("id, run_id, crane_id, planned_date, status, blocks_assignment, notes, certificate_reference, next_loler_due_on, completed_at, completed_by, created_at, updated_at")
      .in("run_id", runIds)
      .order("created_at", { ascending: true });

    if (itemError) {
      if (isMissingLolerTable(itemError)) {
        setupRequired = true;
        loadErrors.push("LOLER inspection item table is not available yet. Run the LOLER SQL before using this page.");
      } else {
        loadErrors.push(itemError.message);
      }
    } else {
      items = itemRows ?? [];
    }
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1450px, 96vw)", margin: "0 auto" }}>
        <LolerInspectionManager
          cranes={cranes ?? []}
          initialRuns={runs ?? []}
          initialItems={items}
          loadError={loadErrors.length ? loadErrors.join(" ") : null}
          setupRequired={setupRequired}
        />
      </div>
    </ClientShell>
  );
}
