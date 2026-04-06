import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

async function safeCount(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: string,
  column: string,
  value: string
) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export default async function DeleteCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: customer } = await supabase
    .from("clients")
    .select("id, company_name")
    .eq("id", params.id)
    .single();

  const [
    bookingCount,
    jobCount,
    transportJobCount,
    quoteCount,
    correspondenceCount,
    importedHistoryCount,
    workflowTaskCount,
    convertedLeadCount,
  ] = await Promise.all([
    safeCount(supabase, "bookings", "client_id", params.id),
    safeCount(supabase, "jobs", "client_id", params.id),
    safeCount(supabase, "transport_jobs", "client_id", params.id),
    safeCount(supabase, "quotes", "client_id", params.id),
    safeCount(supabase, "customer_correspondence", "client_id", params.id),
    safeCount(supabase, "imported_job_history", "matched_client_id", params.id),
    safeCount(supabase, "sales_workflow_tasks", "client_id", params.id),
    safeCount(supabase, "sales_leads", "converted_client_id", params.id),
  ]);

  const linkedItems = [
    { label: "Bookings", count: bookingCount },
    { label: "Jobs", count: jobCount },
    { label: "Transport jobs", count: transportJobCount },
    { label: "Quotes", count: quoteCount },
    { label: "Customer correspondence", count: correspondenceCount },
    { label: "Imported diary history", count: importedHistoryCount },
    { label: "Sales workflow tasks", count: workflowTaskCount },
    { label: "Converted sales leads", count: convertedLeadCount },
  ].filter((item) => item.count > 0);

  const canDelete = linkedItems.length === 0;

  return (
    <ClientShell>
      <div style={{ width: "min(860px, 92vw)", margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>Delete customer</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          This action cannot be undone.
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
          <p style={{ marginTop: 0 }}>
            Customer: <b>{customer?.company_name ?? "Unknown"}</b>
          </p>

          {!canDelete ? (
            <>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(255,0,0,0.10)",
                  border: "1px solid rgba(255,0,0,0.25)",
                }}
              >
                Cannot delete this customer because they still have linked data.
                Archive them instead, or remove/reassign the linked records first.
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.72)",
                  border: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 10 }}>
                  Linked records found
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {linkedItems.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.65)",
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <span>{item.label}</span>
                      <b>{item.count}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                <a
                  href={`/customers/${params.id}`}
                  style={{
                    display: "inline-block",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "#111",
                    color: "white",
                    textDecoration: "none",
                    fontWeight: 900,
                  }}
                >
                  Back to customer
                </a>

                <a
                  href="/customers"
                  style={{
                    display: "inline-block",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "rgba(255,255,255,0.78)",
                    color: "#111",
                    textDecoration: "none",
                    fontWeight: 900,
                  }}
                >
                  Back to customers
                </a>
              </div>
            </>
          ) : (
            <form action="/api/customers/delete" method="post">
              <input type="hidden" name="id" value={params.id} />

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(255,170,0,0.12)",
                  border: "1px solid rgba(255,170,0,0.22)",
                  marginTop: 12,
                }}
              >
                No linked records were found. This customer can be permanently deleted.
              </div>

              <button
                type="submit"
                style={{
                  width: "100%",
                  marginTop: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#b00020",
                  color: "white",
                  fontSize: 15,
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Yes, permanently delete
              </button>
            </form>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a
            href="/customers"
            style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}
          >
            ← Back to customers
          </a>
        </div>
      </div>
    </ClientShell>
  );
}
