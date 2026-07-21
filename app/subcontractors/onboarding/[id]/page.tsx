import ClientShell from "../../../ClientShell";
import ServerSubmitButton from "../../../components/ServerSubmitButton";
import { geocodeAddress } from "../../../lib/geocode";
import { requireAdmin, requireOfficeUser } from "../../../lib/routeGuards";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import {
  buildOnboardingLink,
  buildWhatsAppInviteUrl,
  isInviteExpired,
  onboardingStatusLabel,
  ONBOARDING_EDITABLE_STATUSES,
  SUBCONTRACTOR_DOCUMENT_BUCKET,
} from "../../../lib/subcontractorOnboarding";
import { sendSubcontractorOnboardingEmail } from "../../../lib/subcontractorOnboardingEmail";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import CopyInviteLink from "./CopyInviteLink";
import WhatsAppInviteButton from "./WhatsAppInviteButton";

export const dynamic = "force-dynamic";

function clean(value: FormDataEntryValue | null, max = 3000) {
  return String(value ?? "").trim().slice(0, max);
}
function numberOrNull(value: FormDataEntryValue | null) {
  const raw = clean(value, 40);
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}
function currentOrigin() {
  const list = headers();
  const host = list.get("x-forwarded-host") || list.get("host") || "";
  const proto = list.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL || "";
}
function actorName(email: string | null | undefined) {
  const raw = String(email ?? "").trim();
  return raw.includes("@") ? raw.split("@")[0] : raw;
}
function fmt(value: any) {
  const text = String(value ?? "").trim();
  return text || "—";
}
function fmtDate(value: any, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fmt(value);
  return date.toLocaleString("en-GB", includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

async function sendInviteEmail(formData: FormData) {
  "use server";
  const access = await requireOfficeUser();
  const admin = createSupabaseAdminClient();
  const id = clean(formData.get("invite_id"), 60);
  const { data: invite, error } = await admin.from("subcontractor_onboarding_invites").select("*").eq("id", id).single();
  if (error || !invite) redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("Onboarding record not found.")}`);
  if (!invite.invitee_email) redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("No email address is saved for this subcontractor.")}`);
  if (!ONBOARDING_EDITABLE_STATUSES.has(invite.status) || isInviteExpired(invite as any)) {
    redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("Reissue an active editable link before sending it.")}`);
  }

  const link = buildOnboardingLink(invite as any, currentOrigin());
  try {
    await sendSubcontractorOnboardingEmail({
      admin,
      to: invite.invitee_email,
      subject: "Complete your AnnS Crane Hire subcontractor onboarding",
      heading: "Subcontractor onboarding",
      paragraphs: [
        `Hi ${String(invite.invitee_name || "").split(/\s+/)[0] || "there"},`,
        "Please complete or update your secure subcontractor onboarding form and submit it to the AnnS Crane Hire office for review.",
        `The current link expires on ${fmtDate(invite.expires_at)}.`,
      ],
      buttonLabel: "Open onboarding form",
      buttonUrl: link,
    });
    await admin.from("subcontractor_onboarding_events").insert({
      invite_id: id,
      event_type: "email_sent",
      actor_type: "office",
      actor_user_id: access.user?.id ?? null,
      actor_username: actorName(access.user?.email) || null,
      detail: { email: invite.invitee_email },
    });
    redirect(`/subcontractors/onboarding/${id}?success=${encodeURIComponent(`Onboarding link emailed to ${invite.invitee_email}.`)}`);
  } catch (caught: any) {
    redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent(caught?.message || "Could not send the email.")}`);
  }
}

async function returnForChanges(formData: FormData) {
  "use server";
  const access = await requireOfficeUser();
  const admin = createSupabaseAdminClient();
  const id = clean(formData.get("invite_id"), 60);
  const message = clean(formData.get("return_message"), 2000);
  if (!message) redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("Enter the changes required.")}`);

  const { data: invite, error } = await admin.from("subcontractor_onboarding_invites").select("*").eq("id", id).single();
  if (error || !invite) redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("Onboarding record not found.")}`);
  if (invite.status !== "submitted_for_review") {
    redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("Only a submitted form can be returned for changes.")}`);
  }

  const minimumExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const existingExpiry = new Date(invite.expires_at);
  const expiresAt = !Number.isFinite(existingExpiry.getTime()) || existingExpiry < minimumExpiry ? minimumExpiry.toISOString() : invite.expires_at;
  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("subcontractor_onboarding_invites").update({
    status: "changes_required",
    return_message: message,
    returned_at: now,
    expires_at: expiresAt,
    updated_at: now,
  }).eq("id", id);
  if (updateError) {
    redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent(updateError.message || "Could not return the form for changes.")}`);
  }
  await admin.from("subcontractor_onboarding_events").insert({
    invite_id: id,
    event_type: "changes_requested",
    actor_type: "office",
    actor_user_id: access.user?.id ?? null,
    actor_username: actorName(access.user?.email) || null,
    detail: { message },
  });

  if (invite.invitee_email) {
    try {
      await sendSubcontractorOnboardingEmail({
        admin,
        to: invite.invitee_email,
        subject: "Changes required - AnnS subcontractor onboarding",
        heading: "Please update your onboarding form",
        paragraphs: [
          `Hi ${String(invite.invitee_name || "").split(/\s+/)[0] || "there"},`,
          "The AnnS Crane Hire office has reviewed your onboarding submission and needs the following changes:",
          message,
          "Open the secure form, make the changes and submit it again for review.",
        ],
        buttonLabel: "Update onboarding form",
        buttonUrl: buildOnboardingLink(invite as any, currentOrigin()),
      });
    } catch {
      // Returning the form is more important than email delivery. The link remains available for WhatsApp/copy.
    }
  }

  redirect(`/subcontractors/onboarding/${id}?success=${encodeURIComponent("Returned to the subcontractor for changes.")}`);
}

async function revokeInvite(formData: FormData) {
  "use server";
  const access = await requireOfficeUser();
  const admin = createSupabaseAdminClient();
  const id = clean(formData.get("invite_id"), 60);
  const { data: invite } = await admin.from("subcontractor_onboarding_invites").select("token_version,status").eq("id", id).single();
  if (!invite) redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("Onboarding record not found.")}`);
  if (invite.status === "approved") redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("An approved onboarding record cannot be revoked.")}`);

  const now = new Date().toISOString();
  const { error: revokeError } = await admin.from("subcontractor_onboarding_invites").update({
    status: "revoked",
    revoked_at: now,
    token_version: Number(invite.token_version || 1) + 1,
    updated_at: now,
  }).eq("id", id);
  if (revokeError) {
    redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent(revokeError.message || "Could not revoke the invitation.")}`);
  }
  await admin.from("subcontractor_onboarding_events").insert({
    invite_id: id,
    event_type: "revoked",
    actor_type: "office",
    actor_user_id: access.user?.id ?? null,
    actor_username: actorName(access.user?.email) || null,
  });
  redirect(`/subcontractors/onboarding/${id}?success=${encodeURIComponent("Invitation revoked. The previous link no longer works.")}`);
}

async function reissueInvite(formData: FormData) {
  "use server";
  const access = await requireOfficeUser();
  const admin = createSupabaseAdminClient();
  const id = clean(formData.get("invite_id"), 60);
  const days = Math.min(30, Math.max(1, Number(clean(formData.get("expiry_days"), 10)) || 7));
  const { data: invite } = await admin.from("subcontractor_onboarding_invites").select("*").eq("id", id).single();
  if (!invite) redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("Onboarding record not found.")}`);
  if (["approved", "submitted_for_review"].includes(invite.status)) {
    redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("This onboarding record cannot be reissued in its current status.")}`);
  }

  const wasRevoked = invite.status === "revoked";
  const nextStatus = wasRevoked ? "invite_sent" : invite.status;
  const { error: reissueError } = await admin.from("subcontractor_onboarding_invites").update({
    status: nextStatus,
    token_version: Number(invite.token_version || 1) + 1,
    expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    revoked_at: null,
    submitted_at: wasRevoked ? null : invite.submitted_at,
    declaration_name: wasRevoked ? null : invite.declaration_name,
    declaration_signed_at: wasRevoked ? null : invite.declaration_signed_at,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (reissueError) {
    redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent(reissueError.message || "Could not reissue the invitation.")}`);
  }
  await admin.from("subcontractor_onboarding_events").insert({
    invite_id: id,
    event_type: "link_reissued",
    actor_type: "office",
    actor_user_id: access.user?.id ?? null,
    actor_username: actorName(access.user?.email) || null,
    detail: { expiry_days: days },
  });
  redirect(`/subcontractors/onboarding/${id}?success=${encodeURIComponent("A new secure link has been issued. The previous link no longer works.")}`);
}

async function approveOnboarding(formData: FormData) {
  "use server";
  const access = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const id = clean(formData.get("invite_id"), 60);
  const { data: invite, error } = await admin.from("subcontractor_onboarding_invites").select("*").eq("id", id).single();
  if (error || !invite) redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("Onboarding record not found.")}`);
  if (invite.status !== "submitted_for_review") redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("This form is not awaiting approval.")}`);

  const submission = (invite.submission_data || {}) as Record<string, any>;
  const fullName = String(submission.full_name || invite.invitee_name || "").trim();
  if (!fullName) redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent("The submitted full name is missing.")}`);
  const postcode = String(submission.base_postcode || "").trim();
  const coords = postcode ? await geocodeAddress(postcode) : null;
  const dayRate = numberOrNull(formData.get("standard_day_rate"));
  const hourlyRate = numberOrNull(formData.get("standard_hourly_rate"));
  const payBasis = clean(formData.get("pay_basis"), 40) || (dayRate != null ? "day_rate" : hourlyRate != null ? "hourly" : "other");
  const paymentType = clean(formData.get("subcontractor_payment_type"), 40) || String(submission.preferred_payment_type || "");
  const payrollNotes = clean(formData.get("payroll_notes"), 3000);
  const approvalNotes = clean(formData.get("approval_notes"), 3000);

  const operatorPayload = {
    full_name: fullName,
    company_name: submission.company_name || "",
    phone: submission.phone || invite.invitee_phone || "",
    email: submission.email || invite.invitee_email || "",
    role: submission.role || invite.invited_role || "",
    notes: submission.notes || "",
    base_postcode: postcode,
    base_lat: coords?.lat ?? "",
    base_lng: coords?.lng ?? "",
    address_line_1: submission.address_line_1 || "",
    address_line_2: submission.address_line_2 || "",
    town_city: submission.town_city || "",
    county: submission.county || "",
    standard_day_rate: dayRate ?? "",
    standard_hourly_rate: hourlyRate ?? "",
    pay_basis: payBasis,
    subcontractor_payment_type: paymentType,
    payroll_notes: payrollNotes,
    emergency_contact_name: submission.emergency_contact_name || "",
    emergency_contact_phone: submission.emergency_contact_phone || "",
    card_notes: "Qualifications and documents supplied through secure subcontractor onboarding.",
    approval_notes: approvalNotes,
  };
  const privatePayload = {
    business_type: submission.business_type || "",
    utr_number: submission.utr_number || "",
    vat_number: submission.vat_number || "",
    company_registration_number: submission.company_registration_number || "",
    bank_account_name: submission.bank_account_name || "",
    bank_sort_code: submission.bank_sort_code || "",
    bank_account_number: submission.bank_account_number || "",
    insurance_provider: submission.insurance_provider || "",
    insurance_policy_number: submission.insurance_policy_number || "",
    insurance_cover_amount: submission.insurance_cover_amount || "",
    insurance_expiry_date: submission.insurance_expiry_date || "",
    declaration_name: invite.declaration_name || submission.declaration_name || "",
    declaration_signed_at: invite.declaration_signed_at || "",
  };
  const qualifications = Array.isArray(submission.qualifications)
    ? submission.qualifications.filter((item: any) => String(item?.qualification_name || "").trim())
    : [];

  const { data: operatorId, error: approveError } = await admin.rpc("approve_subcontractor_onboarding", {
    p_invite_id: id,
    p_operator_payload: operatorPayload,
    p_private_payload: privatePayload,
    p_qualifications: qualifications,
    p_actor_user_id: access.user?.id ?? null,
    p_actor_username: actorName(access.user?.email) || null,
  });

  if (approveError || !operatorId) {
    redirect(`/subcontractors/onboarding/${id}?error=${encodeURIComponent(approveError?.message || "Approval failed.")}`);
  }

  if (invite.invitee_email) {
    try {
      await sendSubcontractorOnboardingEmail({
        admin,
        to: invite.invitee_email,
        subject: "AnnS Crane Hire subcontractor onboarding approved",
        heading: "Your onboarding has been approved",
        paragraphs: [
          `Hi ${fullName.split(/\s+/)[0] || fullName},`,
          "Your subcontractor onboarding information has been reviewed and approved by AnnS Crane Hire.",
          "The office will contact you separately regarding work allocation and any further requirements.",
        ],
      });
    } catch {
      // Approval remains complete if the confirmation email cannot be sent.
    }
  }

  redirect(`/subcontractors/${operatorId}?success=${encodeURIComponent("Subcontractor onboarding approved and active record created.")}`);
}

export default async function OnboardingReviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string; message?: string };
}) {
  const access = await requireOfficeUser();
  const canViewPrivate = access.role === "admin";
  const canApprove = access.role === "admin";
  const admin = createSupabaseAdminClient();
  const [{ data: invite, error }, { data: documents }, { data: events }] = await Promise.all([
    admin.from("subcontractor_onboarding_invites").select("*").eq("id", params.id).single(),
    admin.from("subcontractor_onboarding_documents").select("*").eq("invite_id", params.id).order("created_at", { ascending: false }),
    admin.from("subcontractor_onboarding_events").select("*").eq("invite_id", params.id).order("created_at", { ascending: false }).limit(30),
  ]);

  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : searchParams?.message ? decodeURIComponent(searchParams.message) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  if (error || !invite) {
    return (
      <ClientShell>
        <div style={{ width: "min(1000px,95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{error?.message || "Onboarding record not found."}</div>
        </div>
      </ClientShell>
    );
  }

  const submission = (invite.submission_data || {}) as Record<string, any>;
  const link = buildOnboardingLink(invite as any, currentOrigin());
  const whatsappUrl = buildWhatsAppInviteUrl({ phone: invite.invitee_phone, name: invite.invitee_name, link });
  const expired = isInviteExpired(invite as any);
  const editableLinkActive = !expired && ONBOARDING_EDITABLE_STATUSES.has(invite.status);
  const signedDocuments = await Promise.all((documents || []).map(async (document: any) => {
    const { data } = await admin.storage.from(document.storage_bucket || SUBCONTRACTOR_DOCUMENT_BUCKET).createSignedUrl(document.storage_path, 60 * 60, { download: document.original_filename || "document" });
    return { ...document, signedUrl: data?.signedUrl || null };
  }));
  const qualifications = Array.isArray(submission.qualifications) ? submission.qualifications : [];

  return (
    <ClientShell>
      <div style={{ width: "min(1250px,96vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{invite.invitee_name}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Secure subcontractor onboarding review.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href="/subcontractors" style={secondaryBtn}>← Back to subcontractors</a>
            {invite.operator_id ? <a href={`/subcontractors/${invite.operator_id}`} style={secondaryBtn}>Open active record</a> : null}
          </div>
        </div>

        {successMessage ? <div style={successBox}>{successMessage}</div> : null}
        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

        <section style={sectionCard}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <h2 style={sectionTitle}>Invitation and progress</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...pill, ...statusStyle(invite.status) }}>{onboardingStatusLabel(invite.status)}</span>
                {editableLinkActive ? <span style={{ ...pill, ...pillGood }}>Link active</span>
                  : expired ? <span style={{ ...pill, ...pillBad }}>Expired</span>
                    : invite.status === "submitted_for_review" ? <span style={{ ...pill, ...pill }}>Form locked</span>
                      : invite.status === "approved" ? <span style={{ ...pill, ...pillGood }}>Complete</span>
                        : <span style={{ ...pill, ...pillBad }}>Link inactive</span>}
              </div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.78 }}>Expires: {fmtDate(invite.expires_at, true)}</div>
          </div>
          {editableLinkActive ? <div style={{ marginTop: 14 }}><CopyInviteLink link={link} /></div> : (
            <div style={{ ...warningBox, marginTop: 14 }}>
              {invite.status === "submitted_for_review"
                ? "The subcontractor form is locked while it is under review. Return it for changes to make the link editable again."
                : invite.status === "approved"
                  ? "This onboarding is complete and the public form is closed."
                  : "This link is not active. Reissue it before sending it to the subcontractor."}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {whatsappUrl && editableLinkActive ? <WhatsAppInviteButton inviteId={invite.id} whatsappUrl={whatsappUrl} /> : null}
            {invite.invitee_email && editableLinkActive ? (
              <form action={sendInviteEmail}>
                <input type="hidden" name="invite_id" value={invite.id} />
                <ServerSubmitButton style={secondaryButtonElement} pendingText="Sending…">Email link</ServerSubmitButton>
              </form>
            ) : null}
            {!["approved", "submitted_for_review"].includes(invite.status) ? (
              <form action={reissueInvite} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="invite_id" value={invite.id} />
                <select name="expiry_days" defaultValue="7" style={smallSelect}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select>
                <ServerSubmitButton style={secondaryButtonElement} pendingText="Reissuing…">Reissue link</ServerSubmitButton>
              </form>
            ) : null}
            {!['approved','revoked'].includes(invite.status) ? (
              <form action={revokeInvite}>
                <input type="hidden" name="invite_id" value={invite.id} />
                <ServerSubmitButton style={dangerButton} pendingText="Revoking…">Revoke link</ServerSubmitButton>
              </form>
            ) : null}
          </div>
          <div style={miniGrid}>
            <Metric label="Created" value={fmtDate(invite.created_at, true)} />
            <Metric label="First opened" value={fmtDate(invite.first_opened_at, true)} />
            <Metric label="Last saved" value={fmtDate(invite.last_saved_at, true)} />
            <Metric label="Submitted" value={fmtDate(invite.submitted_at, true)} />
          </div>
        </section>

        {invite.return_message ? <div style={warningBox}><strong>Current changes requested:</strong><br />{invite.return_message}</div> : null}

        <div style={twoColumns}>
          <div style={{ display: "grid", gap: 16 }}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Personal and business details</h2>
              <Row label="Full name" value={submission.full_name || invite.invitee_name} />
              <Row label="Company" value={submission.company_name} />
              <Row label="Role / trade" value={submission.role || invite.invited_role} />
              <Row label="Phone" value={submission.phone || invite.invitee_phone} />
              <Row label="Email" value={submission.email || invite.invitee_email} />
              <Row label="Business type" value={String(submission.business_type || "").replace(/_/g, " ")} />
              <Row label="Company number" value={submission.company_registration_number} />
              {canViewPrivate ? <Row label="UTR" value={submission.utr_number} /> : null}
              <Row label="VAT number" value={submission.vat_number} />
              <Row label="Preferred payment" value={String(submission.preferred_payment_type || "").toUpperCase().replace("_", " ")} />
              <Row label="Distance willing to travel" value={submission.willing_travel_distance} />
              <Row label="Right to work confirmed" value={submission.right_to_work_confirmed ? "Yes" : "No"} />
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Address and emergency contact</h2>
              <Row label="Address line 1" value={submission.address_line_1} />
              <Row label="Address line 2" value={submission.address_line_2} />
              <Row label="Town / city" value={submission.town_city} />
              <Row label="County" value={submission.county} />
              <Row label="Postcode" value={submission.base_postcode} />
              <Row label="Emergency contact" value={submission.emergency_contact_name} />
              <Row label="Emergency phone" value={submission.emergency_contact_phone} />
              <Block label="Additional information" value={submission.notes} />
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Qualifications and cards</h2>
              {qualifications.length === 0 ? <div style={{ opacity: 0.72 }}>No qualifications entered.</div> : (
                <div style={{ display: "grid", gap: 10 }}>
                  {qualifications.map((qualification: any, index: number) => (
                    <div key={qualification.id || index} style={miniCard}>
                      <div style={{ fontWeight: 900 }}>{fmt(qualification.qualification_name)}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                        {fmt(qualification.issuer)} • {fmt(qualification.certificate_number)}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                        Issue: {fmtDate(qualification.issue_date)} • Expiry: {fmtDate(qualification.expiry_date)}
                      </div>
                      {qualification.notes ? <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{qualification.notes}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            {canViewPrivate ? (
              <section style={sectionCard}>
                <h2 style={sectionTitle}>Private identity and bank details</h2>
                <div style={privateWarning}>Sensitive information - admin access only.</div>
                <Row label="Date of birth" value={fmtDate(submission.date_of_birth)} />
                <Row label="NI number" value={submission.national_insurance_number} />
                <Row label="UTR" value={submission.utr_number} />
                <Row label="Account name" value={submission.bank_account_name} />
                <Row label="Sort code" value={submission.bank_sort_code} />
                <Row label="Account number" value={submission.bank_account_number} />
              </section>
            ) : null}

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Insurance</h2>
              <Row label="Has own cover" value={submission.has_insurance_cover === "yes" ? "Yes" : submission.has_insurance_cover === "no" ? "No" : "—"} />
              <Row label="Provider" value={submission.insurance_provider} />
              <Row label="Policy number" value={submission.insurance_policy_number} />
              <Row label="Cover amount" value={submission.insurance_cover_amount} />
              <Row label="Expiry" value={fmtDate(submission.insurance_expiry_date)} />
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Declaration</h2>
              <Row label="Working terms accepted" value={submission.working_terms_accepted ? "Yes" : "No"} />
              <Row label="Declaration accepted" value={submission.declaration_accepted ? "Yes" : "No"} />
              <Row label="Signed by" value={invite.declaration_name || submission.declaration_name} />
              <Row label="Signed at" value={fmtDate(invite.declaration_signed_at, true)} />
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Uploaded documents</h2>
              {signedDocuments.length === 0 ? <div style={{ opacity: 0.72 }}>No documents uploaded.</div> : (
                <div style={{ display: "grid", gap: 9 }}>
                  {signedDocuments.map((document: any) => (
                    <div key={document.id} style={documentRow}>
                      <div>
                        <div style={{ fontWeight: 850 }}>{document.original_filename}</div>
                        <div style={{ fontSize: 12, opacity: 0.72, marginTop: 3 }}>
                          {String(document.category || "other").replace(/_/g, " ")}
                          {document.expiry_date ? ` • Expires ${fmtDate(document.expiry_date)}` : ""}
                        </div>
                      </div>
                      {document.signedUrl ? <a href={document.signedUrl} target="_blank" rel="noreferrer" style={smallLink}>Open</a> : <span style={{ fontSize: 12 }}>Unavailable</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {invite.status === "submitted_for_review" && canApprove ? (
          <section style={{ ...sectionCard, border: "2px solid rgba(0,140,80,.35)" }}>
            <h2 style={sectionTitle}>Approve and create active subcontractor</h2>
            <p style={{ marginTop: 0, opacity: 0.8 }}>Check the submission and documents, then enter any office-agreed rates and payroll details.</p>
            <form action={approveOnboarding} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="invite_id" value={invite.id} />
              <div style={formGrid}>
                <OfficeField label="Agreed day rate (£)" name="standard_day_rate" type="number" />
                <OfficeField label="Agreed hourly rate (£)" name="standard_hourly_rate" type="number" />
                <OfficeSelect label="Pay basis" name="pay_basis" defaultValue="other" options={[["day_rate","Day rate"],["hourly","Hourly"],["fixed","Fixed"],["other","Other"]]} />
                <OfficeSelect label="How paid" name="subcontractor_payment_type" defaultValue={submission.preferred_payment_type || ""} options={[["","Select payment type"],["limited_company_invoice","Limited company - invoice"],["sole_trader_invoice","Sole trader - invoice"],["paye","PAYE"],["cis_20","CIS 20%"],["cis_30","CIS 30%"],["other","Other / confirm with office"]]} />
              </div>
              <OfficeTextArea label="Payroll notes" name="payroll_notes" />
              <OfficeTextArea label="Approval / internal notes" name="approval_notes" />
              <div><ServerSubmitButton style={approveButton} pendingText="Approving…">Approve subcontractor</ServerSubmitButton></div>
            </form>
          </section>
        ) : null}

        {invite.status === "submitted_for_review" && !canApprove ? (
          <div style={warningBox}>Only an admin user can approve this subcontractor. You can still return the form for changes.</div>
        ) : null}

        {invite.status === "submitted_for_review" ? (
          <section style={sectionCard}>
            <h2 style={sectionTitle}>Return for changes</h2>
            <form action={returnForChanges} style={{ display: "grid", gap: 10 }}>
              <input type="hidden" name="invite_id" value={invite.id} />
              <OfficeTextArea label="Explain exactly what needs changing" name="return_message" required />
              <div><ServerSubmitButton style={warningButton} pendingText="Returning…">Return to subcontractor</ServerSubmitButton></div>
            </form>
          </section>
        ) : null}

        <section style={sectionCard}>
          <h2 style={sectionTitle}>Activity</h2>
          {(events || []).length === 0 ? <div style={{ opacity: 0.72 }}>No activity recorded.</div> : (
            <div style={{ display: "grid", gap: 8 }}>
              {(events || []).map((event: any) => (
                <div key={event.id} style={eventRow}>
                  <div><strong>{String(event.event_type || "event").replace(/_/g, " ")}</strong>{event.actor_username ? ` by ${event.actor_username}` : ""}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{fmtDate(event.created_at, true)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ClientShell>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return <div style={rowStyle}><div style={rowLabel}>{label}</div><div>{fmt(value)}</div></div>;
}
function Block({ label, value }: { label: string; value: any }) {
  return <div style={{ ...rowStyle, alignItems: "start" }}><div style={rowLabel}>{label}</div><div style={{ whiteSpace: "pre-wrap" }}>{fmt(value)}</div></div>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div style={metricCard}><div style={{ fontSize: 11, fontWeight: 850, opacity: 0.65, textTransform: "uppercase" }}>{label}</div><div style={{ marginTop: 4, fontWeight: 800 }}>{value}</div></div>;
}
function OfficeField({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue?: string; type?: string }) {
  return <div style={{ display: "grid", gap: 6 }}><label style={fieldLabel}>{label}</label><input name={name} defaultValue={defaultValue} type={type} step={type === "number" ? "0.01" : undefined} style={fieldInput} /></div>;
}
function OfficeSelect({ label, name, defaultValue, options }: { label: string; name: string; defaultValue?: string; options: string[][] }) {
  return <div style={{ display: "grid", gap: 6 }}><label style={fieldLabel}>{label}</label><select name={name} defaultValue={defaultValue} style={fieldInput}>{options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></div>;
}
function OfficeTextArea({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return <div style={{ display: "grid", gap: 6 }}><label style={fieldLabel}>{label}</label><textarea name={name} required={required} rows={4} style={{ ...fieldInput, minHeight: 100, resize: "vertical" }} /></div>;
}
function statusStyle(status: string): React.CSSProperties {
  if (status === "approved") return pillGood;
  if (status === "submitted_for_review") return { background: "rgba(37,99,235,.12)", color: "#1d4ed8", border: "1px solid rgba(37,99,235,.25)" };
  if (status === "changes_required") return { background: "rgba(245,158,11,.15)", color: "#92400e", border: "1px solid rgba(245,158,11,.3)" };
  if (status === "revoked") return pillBad;
  return { background: "rgba(0,0,0,.06)", color: "#111", border: "1px solid rgba(0,0,0,.12)" };
}

const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
const sectionCard: React.CSSProperties = { background: "rgba(255,255,255,.30)", padding: 16, borderRadius: 14, border: "1px solid rgba(255,255,255,.55)", boxShadow: "0 8px 30px rgba(0,0,0,.07)" };
const sectionTitle: React.CSSProperties = { margin: "0 0 12px", fontSize: 22 };
const twoColumns: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 16 };
const miniGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginTop: 14 };
const metricCard: React.CSSProperties = { padding: 10, borderRadius: 10, background: "rgba(255,255,255,.58)", border: "1px solid rgba(0,0,0,.07)" };
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "155px minmax(0,1fr)", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,.06)" };
const rowLabel: React.CSSProperties = { fontSize: 11, fontWeight: 850, opacity: .66, textTransform: "uppercase", letterSpacing: .35 };
const miniCard: React.CSSProperties = { borderRadius: 12, border: "1px solid rgba(0,0,0,.08)", background: "rgba(255,255,255,.68)", padding: 12 };
const documentRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, background: "rgba(255,255,255,.62)", border: "1px solid rgba(0,0,0,.07)" };
const eventRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(0,0,0,.06)", textTransform: "capitalize" };
const pill: React.CSSProperties = { display: "inline-block", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900 };
const pillGood: React.CSSProperties = { background: "rgba(0,160,80,.13)", color: "#0b6b34", border: "1px solid rgba(0,160,80,.24)" };
const pillBad: React.CSSProperties = { background: "rgba(190,0,0,.12)", color: "#991b1b", border: "1px solid rgba(190,0,0,.22)" };
const privateWarning: React.CSSProperties = { padding: "9px 11px", borderRadius: 9, background: "rgba(190,0,0,.08)", border: "1px solid rgba(190,0,0,.14)", color: "#7f1d1d", fontSize: 12, fontWeight: 800, marginBottom: 8 };
const successBox: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "rgba(0,160,80,.14)", border: "1px solid rgba(0,160,80,.18)", color: "#0b6b34", fontWeight: 700 };
const errorBox: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "rgba(180,0,0,.12)", border: "1px solid rgba(180,0,0,.18)", color: "#8b0000", fontWeight: 700 };
const warningBox: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "rgba(245,158,11,.14)", border: "1px solid rgba(245,158,11,.25)", color: "#854d0e", lineHeight: 1.45 };
const secondaryBtn: React.CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,.82)", color: "#111", textDecoration: "none", fontWeight: 800, border: "1px solid rgba(0,0,0,.10)" };
const secondaryButtonElement: React.CSSProperties = { padding: "9px 12px", minHeight: 40, borderRadius: 9, background: "rgba(255,255,255,.85)", color: "#111", fontWeight: 850, border: "1px solid rgba(0,0,0,.14)", cursor: "pointer" };
const dangerButton: React.CSSProperties = { ...secondaryButtonElement, color: "#991b1b", border: "1px solid rgba(185,28,28,.25)" };
const whatsappBtn: React.CSSProperties = { ...secondaryButtonElement, display: "inline-flex", alignItems: "center", textDecoration: "none", color: "#166534", border: "1px solid rgba(22,101,52,.25)" };
const smallSelect: React.CSSProperties = { minHeight: 40, padding: "8px 9px", borderRadius: 9, border: "1px solid rgba(0,0,0,.14)" };
const smallLink: React.CSSProperties = { padding: "6px 9px", borderRadius: 8, background: "#111", color: "#fff", textDecoration: "none", fontWeight: 850, fontSize: 12 };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 };
const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 800, opacity: .76 };
const fieldInput: React.CSSProperties = { width: "100%", minHeight: 42, padding: "9px 11px", borderRadius: 10, border: "1px solid rgba(0,0,0,.14)", background: "rgba(255,255,255,.95)", boxSizing: "border-box" };
const approveButton: React.CSSProperties = { padding: "11px 16px", borderRadius: 10, border: "none", background: "#0b6b34", color: "#fff", fontWeight: 900, cursor: "pointer" };
const warningButton: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, border: "none", background: "#92400e", color: "#fff", fontWeight: 900, cursor: "pointer" };
