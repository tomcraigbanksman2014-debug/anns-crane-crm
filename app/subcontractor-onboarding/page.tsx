import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import styles from "./public-onboarding.module.css";
import {
  buildOnboardingLink,
  cleanSubmissionValue,
  type OnboardingInvite,
} from "../lib/subcontractorOnboarding";
import { sendSubcontractorOnboardingEmail } from "../lib/subcontractorOnboardingEmail";
import {
  createPublicFormProof,
  getClientIp,
  hashOnboardingValue,
  publicOnboardingEnabled,
  requireOnboardingRateLimit,
  verifyPublicFormProof,
} from "../lib/subcontractorOnboardingSecurity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subcontractor onboarding | AnnS Crane Hire",
  description: "Apply to join the AnnS Crane Hire subcontractor network.",
  robots: { index: false, follow: false },
};

function currentOrigin() {
  const headerList = headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "";
  const proto =
    headerList.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL || "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalisePhone(value: string) {
  return value.replace(/\D/g, "").slice(-15);
}

function redirectWithError(message: string) {
  redirect(`/subcontractor-onboarding?error=${encodeURIComponent(message)}`);
}

async function startApplication(formData: FormData) {
  "use server";

  if (!publicOnboardingEnabled()) {
    redirectWithError("Public subcontractor onboarding is temporarily unavailable.");
  }

  const fullName = cleanSubmissionValue(formData.get("full_name"), 160);
  const email = cleanSubmissionValue(formData.get("email"), 240).toLowerCase();
  const phone = cleanSubmissionValue(formData.get("phone"), 60);
  const role = cleanSubmissionValue(formData.get("role"), 160);
  const website = cleanSubmissionValue(formData.get("company_website"), 240);
  const formProof = cleanSubmissionValue(formData.get("form_proof"), 300);

  // Hidden anti-spam field. Real applicants never see or complete it.
  if (website || !verifyPublicFormProof(formProof)) {
    redirectWithError("Unable to start the application. Please refresh the page and try again.");
  }

  if (!fullName || !email || !phone || !role) {
    redirectWithError("Enter your full name, email address, mobile number and role / trade.");
  }

  if (!validEmail(email)) {
    redirectWithError("Enter a valid email address.");
  }

  const admin = createSupabaseAdminClient();
  const requestHeaders = headers();
  const ipHash = hashOnboardingValue("ip", getClientIp(requestHeaders));
  const identityHash = hashOnboardingValue(
    "public-identity",
    `${email}|${normalisePhone(phone)}`
  );

  // Connection-level controls remain in place, but the limits are high enough for
  // legitimate users sharing a mobile carrier, workplace or site connection.
  try {
    await requireOnboardingRateLimit(admin, {
      keyHash: ipHash,
      action: "public_start_ip_hour_v2",
      windowSeconds: 60 * 60,
      maxRequests: 30,
    });
    await requireOnboardingRateLimit(admin, {
      keyHash: ipHash,
      action: "public_start_ip_day_v2",
      windowSeconds: 24 * 60 * 60,
      maxRequests: 100,
    });
    await requireOnboardingRateLimit(admin, {
      keyHash: hashOnboardingValue("global", "public-start-v2"),
      action: "public_start_global_hour_v2",
      windowSeconds: 60 * 60,
      maxRequests: 500,
    });
  } catch (error: any) {
    if (error?.message === "ONBOARDING_RATE_LIMITED") {
      redirectWithError(
        "There have been too many recent attempts from this connection. Please wait and try again, or contact the AnnS office."
      );
    }
    redirectWithError("The onboarding service is temporarily unavailable. Please try again later.");
  }

  const duplicateCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const openStatuses = [
    "invite_sent",
    "in_progress",
    "changes_required",
    "submitted_for_review",
  ];

  const [emailLookup, phoneLookup] = await Promise.all([
    admin
      .from("subcontractor_onboarding_invites")
      .select("id, token_version, invitee_name, invitee_email, invitee_phone, status, expires_at")
      .eq("invitee_email", email)
      .in("status", openStatuses)
      .gte("created_at", duplicateCutoff)
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("subcontractor_onboarding_invites")
      .select("id, token_version, invitee_name, invitee_email, invitee_phone, status, expires_at")
      .eq("invitee_phone", phone)
      .in("status", openStatuses)
      .gte("created_at", duplicateCutoff)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (emailLookup.error || phoneLookup.error) {
    console.error("Public onboarding duplicate check failed", {
      email: emailLookup.error?.message,
      phone: phoneLookup.error?.message,
    });
    redirectWithError("The application could not be started. Please try again later.");
  }

  const emailMatch = (emailLookup.data?.[0] ?? null) as OnboardingInvite | null;
  const phoneMatch = (phoneLookup.data?.[0] ?? null) as OnboardingInvite | null;
  const matchingInvite = emailMatch || phoneMatch;

  if (matchingInvite) {
    if (matchingInvite.status === "submitted_for_review") {
      redirectWithError(
        "An application using these contact details has already been submitted and is awaiting review."
      );
    }

    // Only send a continuation link when the entered email exactly matches the
    // existing application. This avoids sending a private link to a changed address.
    if (emailMatch && String(emailMatch.invitee_email || "").toLowerCase() === email) {
      let continuationSent = false;

      try {
        await requireOnboardingRateLimit(admin, {
          keyHash: identityHash,
          action: "public_resume_email_hour_v2",
          windowSeconds: 60 * 60,
          maxRequests: 3,
          inviteId: emailMatch.id,
        });

        const link = buildOnboardingLink(emailMatch, currentOrigin());
        await sendSubcontractorOnboardingEmail({
          admin,
          to: email,
          subject: "Continue your AnnS subcontractor application",
          heading: "Continue your subcontractor application",
          paragraphs: [
            `Hi ${String(emailMatch.invitee_name || fullName).split(/\s+/)[0] || "there"},`,
            "An application using your details has already been started. Use the secure button below to continue where you left off.",
          ],
          buttonLabel: "Continue application",
          buttonUrl: link,
        });

        await admin.from("subcontractor_onboarding_events").insert({
          invite_id: emailMatch.id,
          event_type: "continuation_link_resent",
          actor_type: "subcontractor",
          detail: { source: "public_onboarding_link", ip_hash: ipHash },
        });

        continuationSent = true;
      } catch (error: any) {
        if (error?.message === "ONBOARDING_RATE_LIMITED") {
          redirectWithError(
            "A continuation email has already been requested recently. Please check your inbox and junk folder."
          );
        }
        console.error("Public onboarding continuation email failed", {
          inviteId: emailMatch.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (continuationSent) {
        redirectWithError(
          "An application already exists. We have emailed your secure continuation link."
        );
      }
    }

    redirectWithError(
      "An application using these contact details already exists. Please use your secure continuation link or contact the AnnS office."
    );
  }

  // This identity limit is checked only when a new application is actually eligible
  // to be created. Repeat visits to an existing application no longer consume it.
  try {
    await requireOnboardingRateLimit(admin, {
      keyHash: identityHash,
      action: "public_identity_create_day_v2",
      windowSeconds: 24 * 60 * 60,
      maxRequests: 3,
    });
  } catch (error: any) {
    if (error?.message === "ONBOARDING_RATE_LIMITED") {
      redirectWithError(
        "An application has already been started recently using these contact details."
      );
    }
    redirectWithError("The onboarding service is temporarily unavailable. Please try again later.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error } = await admin
    .from("subcontractor_onboarding_invites")
    .insert({
      invitee_name: fullName,
      invitee_email: email,
      invitee_phone: phone,
      invited_role: role,
      status: "in_progress",
      expires_at: expiresAt,
      first_opened_at: now.toISOString(),
      last_saved_at: now.toISOString(),
      created_by_username: "public_onboarding_link",
      submission_data: {
        full_name: fullName,
        email,
        phone,
        role,
        qualifications: [],
        source: "public_onboarding_link",
      },
    })
    .select("*")
    .single();

  if (error || !invite) {
    console.error("Public onboarding application creation failed", error?.message);
    redirectWithError("The application could not be started. Please try again later.");
  }

  await admin.from("subcontractor_onboarding_events").insert({
    invite_id: invite.id,
    event_type: "public_application_started",
    actor_type: "subcontractor",
    detail: { source: "public_onboarding_link", ip_hash: ipHash },
  });

  redirect(buildOnboardingLink(invite as OnboardingInvite, currentOrigin()));
}

export default function PublicOnboardingStartPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";
  const enabled = publicOnboardingEnabled();
  const formProof = enabled ? createPublicFormProof() : "";

  return (
    <main className={styles.pageShell}>
      <div className={styles.brand}>AnnS Crane Hire</div>
      <section className={styles.card}>
        <div className={styles.eyebrow}>Subcontractor onboarding</div>
        <h1>Apply to join our subcontractor network</h1>
        <p className={styles.intro}>
          Start your application below. You will then be asked for your personal,
          business, bank, emergency contact, qualification, medical and supporting document details.
        </p>

        {errorMessage ? <div className={styles.errorBox}>{errorMessage}</div> : null}

        {!enabled ? (
          <div className={styles.errorBox}>
            Public subcontractor onboarding is temporarily unavailable. Please contact the AnnS office.
          </div>
        ) : (
          <form action={startApplication} className={styles.formGrid}>
            <input type="hidden" name="form_proof" value={formProof} />
            <div className={styles.field}>
              <label htmlFor="full_name">Full name *</label>
              <input id="full_name" name="full_name" autoComplete="name" required maxLength={160} />
            </div>

            <div className={styles.field}>
              <label htmlFor="role">Role / trade *</label>
              <input
                id="role"
                name="role"
                placeholder="e.g. Slinger / Mobile Crane Operator"
                required
                maxLength={160}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="phone">Mobile number *</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                maxLength={60}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="email">Email address *</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                maxLength={240}
              />
            </div>

            <div className={styles.honeypot} aria-hidden="true">
              <label htmlFor="company_website">Company website</label>
              <input
                id="company_website"
                name="company_website"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div className={styles.notice}>
              Your information will be sent securely to AnnS Crane Hire for review.
              Completing this form does not guarantee work or immediate approval.
            </div>

            <button type="submit" className={styles.submitButton}>Start application</button>
          </form>
        )}
      </section>

      <p className={styles.footerCopy}>
        Your application is private. Each person who starts through this page receives
        their own secure application session.
      </p>
    </main>
  );
}
