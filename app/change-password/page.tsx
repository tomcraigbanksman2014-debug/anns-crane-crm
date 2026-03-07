import ClientShell from "../ClientShell";
import ChangePasswordForm from "./ChangePasswordForm";

export default function ChangePasswordPage() {
  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto" }}>
        <ChangePasswordForm />
      </div>
    </ClientShell>
  );
}
