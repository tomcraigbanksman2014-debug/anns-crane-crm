import ClientShell from "../../../../ClientShell";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import OperatorForm from "../../OperatorForm";

export default async function EditOperatorPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: operator, error } = await supabase
    .from("operators")
    .select("id, full_name, email, phone, status, notes")
    .eq("id", params.id)
    .single();

  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32 }}>Edit Operator</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Update operator details inside the CRM.
          </p>
        </div>

        {error || !operator ? (
          <div style={errorBox}>{error?.message ?? "Operator not found."}</div>
        ) : (
          <OperatorForm
            mode="edit"
            operatorId={operator.id}
            initial={operator}
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
