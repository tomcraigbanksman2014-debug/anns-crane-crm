import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import styles from "./public-onboarding.module.css";
import {
  buildOnboardingLink,
  cleanSubmissionValue,
} from "../lib/subcontractorOnboarding";

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

async function startApplication(formData: FormData) {
  "use server";

  const fullName = cleanSubmissionValue(formData.get("full_name"), 160);
  const email = cleanSubmissionValue(formData.get("email"), 240).toLowerCase();
  const phone = cleanSubmissionValue(formData.get("phone"), 60);
  const role = cleanSubmissionValue(formData.get("role"), 160);
  const website = cleanSubmissionValue(formData.get("company_website"), 240);

  // Hidden anti-spam field. Real applicants never see or complete it.
  if (website) {
    redirect("/subcontractor-onboarding?error=Unable%20to%20start%20the%20application.");
  }

  if (!fullName || !email || !phone || !role) {
    redirect(
      `/subcontractor-onboarding?error=${encodeURIComponent(
        "Enter your full name, email address, mobile number and role / trade."
      )}`
    );
  }

  if (!validEmail(email)) {
    redirect(
      `/subcontractor-onboarding?error=${encodeURIComponent(
        "Enter a valid email address."
      )}`
    );
  }

  const admin = createSupabaseAdminClient();
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
    redirect(
      `/subcontractor-onboarding?error=${encodeURIComponent(
        error?.message || "The application could not be started. Please try again."
      )}`
    );
  }

  await admin.from("subcontractor_onboarding_events").insert({
    invite_id: invite.id,
    event_type: "public_application_started",
    actor_type: "subcontractor",
    detail: { source: "public_onboarding_link" },
  });

  redirect(buildOnboardingLink(invite as any, currentOrigin()));
}

export default function PublicOnboardingStartPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";

  return (
    <main className={styles.pageShell}>
      <div className={styles.brand}>AnnS Crane Hire</div>
      <section className={styles.card}>
        <div className={styles.eyebrow}>Subcontractor onboarding</div>
        <h1>Apply to join our subcontractor network</h1>
        <p className={styles.intro}>
          Start your application below. You will then be asked for your business,
          payment, emergency contact, qualification and supporting document details.
        </p>

        {errorMessage ? <div className={styles.errorBox}>{errorMessage}</div> : null}

        <form action={startApplication} className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="full_name">Full name *</label>
            <input id="full_name" name="full_name" autoComplete="name" required />
          </div>

          <div className={styles.field}>
            <label htmlFor="role">Role / trade *</label>
            <input
              id="role"
              name="role"
              placeholder="e.g. Slinger / Mobile Crane Operator"
              required
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
      </section>

      <p className={styles.footerCopy}>
        Your application is private. Each person who starts through this page receives
        their own secure application session.
      </p>


    </main>
  );
}
