import ClientShell from "../ClientShell";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <ClientShell>
      <div
        style={{
          width: "min(600px, 92vw)",
          margin: "0 auto",
          background: "rgba(255,255,255,0.18)",
          borderRadius: 14,
          padding: 28,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          border: "1px solid rgba(255,255,255,0.4)",
        }}
      >
        <LoginForm />
      </div>
    </ClientShell>
  );
}
