import ClientShell from "../../ClientShell";
import QuoteForm from "../QuoteForm";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function NewQuotePage() {
  const supabase = createSupabaseServerClient();

  const { data: customers, error } = await supabase
    .from("clients")
    .select("id, company_name")
    .order("company_name", { ascending: true });

  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : (
          <QuoteForm mode="create" customers={customers ?? []} />
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
