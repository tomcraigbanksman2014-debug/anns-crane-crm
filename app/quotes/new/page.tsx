import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import QuoteForm from "../QuoteForm";

export default async function NewQuotePage() {
  const supabase = createSupabaseServerClient();

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, company_name, archived")
    .eq("archived", false)
    .order("company_name", { ascending: true });

  return (
    <ClientShell>
      <div style={{ width: "min(1420px, 98vw)", margin: "0 auto" }}>
        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : (
          <QuoteForm
            mode="create"
            customers={(clients ?? []).map((client: any) => ({
              id: client.id,
              company_name: client.company_name ?? null,
            }))}
          />
        )}
      </div>
    </ClientShell>
  );
}

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
