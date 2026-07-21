import type { Metadata } from "next";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import {
  isInviteExpired,
  readInviteFromToken,
} from "../../lib/subcontractorOnboarding";
import PublicOnboardingForm from "./PublicOnboardingForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subcontractor onboarding | AnnS Crane Hire",
  robots: { index: false, follow: false },
};

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default async function SubcontractorOnboardingPage({
  params,
}: {
  params: { token: string };
}) {
  const admin = createSupabaseAdminClient();
  const resolved = await readInviteFromToken(admin, params.token, { allowExpired: true });

  if (!resolved.invite) {
    return <PublicMessage title="Link not recognised" text="This onboarding link is invalid or has been replaced. Please contact AnnS Crane Hire for a new link." />;
  }

  const invite = resolved.invite;
  if (isInviteExpired(invite) && invite.status !== "approved") {
    return <PublicMessage title="This link has expired" text="Please contact AnnS Crane Hire and ask the office to extend or reissue your onboarding link." />;
  }
  if (invite.status === "revoked") {
    return <PublicMessage title="This link is no longer active" text="Please contact AnnS Crane Hire if you believe this is a mistake." />;
  }

  if (!invite.first_opened_at && ["invite_sent", "in_progress", "changes_required"].includes(invite.status)) {
    const now = new Date().toISOString();
    await admin
      .from("subcontractor_onboarding_invites")
      .update({
        first_opened_at: now,
        status: invite.status === "invite_sent" ? "in_progress" : invite.status,
        updated_at: now,
      })
      .eq("id", invite.id);
    await admin.from("subcontractor_onboarding_events").insert({
      invite_id: invite.id,
      event_type: "opened",
      actor_type: "subcontractor",
    });
    invite.first_opened_at = now;
    if (invite.status === "invite_sent") invite.status = "in_progress";
  }

  const { data: documents } = await admin
    .from("subcontractor_onboarding_documents")
    .select("id, category, original_filename, qualification_name, issue_date, expiry_date, size_bytes")
    .eq("invite_id", invite.id)
    .order("created_at", { ascending: false });

  const initialData = {
    full_name: invite.invitee_name || "",
    email: invite.invitee_email || "",
    phone: invite.invitee_phone || "",
    role: invite.invited_role || "",
    ...(invite.submission_data || {}),
    declaration_accepted: false,
  };

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <img src="/logo.png" alt="AnnS Crane Hire" style={{ width: 72, height: 72, objectFit: "contain" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.5, color: "#475569" }}>SECURE ONBOARDING</div>
            <h1 style={{ margin: "4px 0 6px", fontSize: 30, color: "#0f172a" }}>Subcontractor information</h1>
            <p style={{ margin: 0, color: "#64748b", lineHeight: 1.45 }}>
              Complete the form, upload your documents and submit it to the AnnS Crane Hire office for approval.
            </p>
          </div>
        </header>

        <div style={deadlineStyle}>
          This secure link is available until <strong>{dateTime(invite.expires_at)}</strong>. You can save your progress and return using the same link.
        </div>

        <PublicOnboardingForm
          token={params.token}
          initialData={initialData}
          initialDocuments={(documents || []) as any}
          initialStatus={invite.status}
          returnMessage={invite.return_message}
        />

        <footer style={{ textAlign: "center", color: "#64748b", fontSize: 12, padding: "8px 0 24px" }}>
          Your information is used only for subcontractor onboarding, compliance and payment administration.
        </footer>
      </div>
    </main>
  );
}

function PublicMessage({ title, text }: { title: string; text: string }) {
  return (
    <main style={pageStyle}>
      <div style={{ ...shellStyle, maxWidth: 680 }}>
        <div style={{ ...headerStyle, background: "#fff", border: "1px solid #dbe3ee", borderRadius: 16, padding: 24 }}>
          <img src="/logo.png" alt="AnnS Crane Hire" style={{ width: 72, height: 72, objectFit: "contain" }} />
          <div>
            <h1 style={{ margin: "0 0 8px", color: "#0f172a" }}>{title}</h1>
            <p style={{ margin: 0, color: "#475569", lineHeight: 1.55 }}>{text}</p>
          </div>
        </div>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg,#e8f0f9 0%,#f8fafc 100%)",
  padding: "24px 12px",
  fontFamily: "Arial, sans-serif",
};
const shellStyle: React.CSSProperties = { width: "min(1100px, 100%)", margin: "0 auto", display: "grid", gap: 16 };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 16, padding: "8px 4px" };
const deadlineStyle: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", lineHeight: 1.45 };
