import ClientShell from "../../ClientShell";
import ServerSubmitButton from "../../components/ServerSubmitButton";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { requireOfficeUser } from "../../lib/routeGuards";
import {
  buildOnboardingLink,
} from "../../lib/subcontractorOnboarding";
import { sendSubcontractorOnboardingEmail } from "../../lib/subcontractorOnboardingEmail";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function currentOrigin() {
  const headerList = headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "";
  const proto = headerList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL || "";
}

async function createInvite(formData: FormData) {
  "use server";

  const access = await requireOfficeUser();
  const admin = createSupabaseAdminClient();
  const name = clean(formData.get("invitee_name"), 160);
  const email = clean(formData.get("invitee_email"), 240).toLowerCase();
  const phone = clean(formData.get("invitee_phone"), 60);
  const role = clean(formData.get("invited_role"), 160);
  const sendEmail = clean(formData.get("send_email")) === "yes";
  const expiryDays = Math.min(30, Math.max(1, Number(clean(formData.get("expiry_days"))) || 7));

  if (!name) {
    redirect(`/subcontractors/invite?error=${encodeURIComponent("Full name is required.")}`);
  }
  if (!email && !phone) {
    redirect(`/subcontractors/invite?error=${encodeURIComponent("Enter an email address or mobile number.")}`);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(`/subcontractors/invite?error=${encodeURIComponent("Enter a valid email address.")}`);
  }

  const actorEmail = String(access.user?.email ?? "").trim();
  const actorUsername = actorEmail.includes("@") ? actorEmail.split("@")[0] : actorEmail;
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error } = await admin
    .from("subcontractor_onboarding_invites")
    .insert({
      invitee_name: name,
      invitee_email: email || null,
      invitee_phone: phone || null,
      invited_role: role || null,
      status: "invite_sent",
      expires_at: expiresAt,
      created_by_user_id: access.user?.id ?? null,
      created_by_username: actorUsername || null,
      submission_data: {
        full_name: name,
        email,
        phone,
        role,
        qualifications: [],
      },
    })
    .select("*")
    .single();

  if (error || !invite) {
    redirect(`/subcontractors/invite?error=${encodeURIComponent(error?.message || "Could not create the invitation.")}`);
  }

  await admin.from("subcontractor_onboarding_events").insert({
    invite_id: invite.id,
    event_type: "invite_created",
    actor_type: "office",
    actor_user_id: access.user?.id ?? null,
    actor_username: actorUsername || null,
    detail: { expiry_days: expiryDays },
  });

  const link = buildOnboardingLink(invite as any, currentOrigin());
  let delivery = sendEmail && email ? "email_failed" : "link_ready";
  let deliveryMessage = "Invitation created. The secure link is ready to copy or send by WhatsApp.";

  if (sendEmail && email) {
    try {
      await sendSubcontractorOnboardingEmail({
        admin,
        to: email,
        subject: "Complete your AnnS Crane Hire subcontractor onboarding",
        heading: "Subcontractor onboarding",
        paragraphs: [
          `Hi ${name.split(/\s+/)[0] || name},`,
          "AnnS Crane Hire has invited you to complete a secure subcontractor onboarding form.",
          "Please enter your details, upload your cards and supporting documents, then submit the form for office approval.",
          `The link expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}.`,
        ],
        buttonLabel: "Complete onboarding",
        buttonUrl: link,
      });
      delivery = "email_sent";
      deliveryMessage = `Invitation created and emailed to ${email}.`;
      await admin.from("subcontractor_onboarding_events").insert({
        invite_id: invite.id,
        event_type: "email_sent",
        actor_type: "office",
        actor_user_id: access.user?.id ?? null,
        actor_username: actorUsername || null,
        detail: { email },
      });
    } catch (emailError: any) {
      deliveryMessage = `Invitation created, but the email could not be sent: ${emailError?.message || "Email error"}.`;
      await admin.from("subcontractor_onboarding_events").insert({
        invite_id: invite.id,
        event_type: "email_failed",
        actor_type: "office",
        actor_user_id: access.user?.id ?? null,
        actor_username: actorUsername || null,
        detail: { email, error: emailError?.message || "Email error" },
      });
    }
  }

  redirect(
    `/subcontractors/onboarding/${invite.id}?created=1&delivery=${delivery}&message=${encodeURIComponent(deliveryMessage)}`
  );
}

export default async function InviteSubcontractorPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  await requireOfficeUser();
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(900px, 95vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Invite subcontractor</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Create a secure no-login form for the subcontractor to complete themselves.
            </p>
          </div>
          <a href="/subcontractors" style={secondaryBtn}>← Back to subcontractors</a>
        </div>

        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

        <form action={createInvite} style={cardStyle}>
          <div style={grid2}>
            <Field label="Full name *" name="invitee_name" required />
            <Field label="Role / trade" name="invited_role" placeholder="e.g. Slinger / Mobile Crane Operator" />
            <Field label="Mobile number" name="invitee_phone" type="tel" />
            <Field label="Email address" name="invitee_email" type="email" />
            <div style={{ display: "grid", gap: 6 }}>
              <label style={labelStyle}>Link expiry</label>
              <select name="expiry_days" defaultValue="7" style={inputStyle}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
          </div>

          <label style={checkboxStyle}>
            <input type="checkbox" name="send_email" value="yes" defaultChecked />
            <span>Email the secure link immediately when an email address is supplied</span>
          </label>

          <div style={infoBox}>
            Only the name, contact details and role are entered here. Rates, payroll notes, status and internal approval remain office-only.
          </div>

          <div>
            <ServerSubmitButton style={primaryBtn} pendingText="Creating invitation…">
              Create invitation
            </ServerSubmitButton>
          </div>
        </form>
      </div>
    </ClientShell>
  );
}

function Field({ label, name, type = "text", placeholder, required }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} style={inputStyle} />
    </div>
  );
}

const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
const cardStyle: React.CSSProperties = { background: "rgba(255,255,255,0.28)", padding: 18, borderRadius: 14, border: "1px solid rgba(255,255,255,0.50)", boxShadow: "0 8px 30px rgba(0,0,0,0.08)", display: "grid", gap: 16 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, opacity: 0.78 };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", background: "rgba(255,255,255,0.95)", boxSizing: "border-box" };
const checkboxStyle: React.CSSProperties = { display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 750 };
const infoBox: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "rgba(37,99,235,0.09)", border: "1px solid rgba(37,99,235,0.18)", color: "#1e3a8a", lineHeight: 1.45 };
const primaryBtn: React.CSSProperties = { display: "inline-block", padding: "11px 16px", borderRadius: 10, border: "none", background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.82)", color: "#111", textDecoration: "none", fontWeight: 800, border: "1px solid rgba(0,0,0,0.10)" };
const errorBox: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "rgba(180,0,0,0.12)", border: "1px solid rgba(180,0,0,0.18)", color: "#8b0000", fontWeight: 700 };
