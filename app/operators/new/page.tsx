import ClientShell from "../../ClientShell";
import OperatorForm from "../OperatorForm";

export default function NewOperatorPage() {
  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32 }}>Add Operator</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Create a new operator record inside the CRM.
          </p>
        </div>

        <OperatorForm mode="create" />
      </div>
    </ClientShell>
  );
}
