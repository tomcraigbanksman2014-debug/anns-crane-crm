import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import {
  cleanSubmissionValue,
  getOnboardingOrigin,
  ONBOARDING_EDITABLE_STATUSES,
  readInviteFromToken,
} from "../../../lib/subcontractorOnboarding";
import { sendSubcontractorOnboardingEmail } from "../../../lib/subcontractorOnboardingEmail";
import {
  getClientIp,
  hashOnboardingValue,
  publicApiError,
  readJsonBodyLimited,
  requestBodyTooLarge,
  requireOnboardingRateLimit,
} from "../../../lib/subcontractorOnboardingSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIMPLE_FIELDS: Record<string, number> = {
  full_name: 160,
  company_name: 200,
  role: 160,
  phone: 60,
  email: 240,
  base_postcode: 20,
  address_line_1: 240,
  address_line_2: 240,
  town_city: 120,
  county: 120,
  business_type: 80,
  company_registration_number: 80,
  utr_number: 40,
  vat_number: 40,
  requested_day_rate: 30,
  requested_hourly_rate: 30,
  preferred_payment_type: 40,
  bank_account_name: 160,
  bank_sort_code: 20,
  bank_account_number: 20,
  insurance_provider: 160,
  insurance_policy_number: 120,
  insurance_cover_amount: 80,
  insurance_expiry_date: 20,
  emergency_contact_name: 160,
  emergency_contact_phone: 60,
  notes: 3000,
  declaration_name: 160,
};

function sanitizeQualifications(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item: any) => ({
    id: cleanSubmissionValue(item?.id, 80) || crypto.randomUUID(),
    qualification_name: cleanSubmissionValue(item?.qualification_name, 160),
    issuer: cleanSubmissionValue(item?.issuer, 160),
    certificate_number: cleanSubmissionValue(item?.certificate_number, 120),
    issue_date: cleanSubmissionValue(item?.issue_date, 20),
    expiry_date: cleanSubmissionValue(item?.expiry_date, 20),
    notes: cleanSubmissionValue(item?.notes, 500),
  }));
}

function digitsOnly(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function sanitizeSubmission(raw: any) {
  const result: Record<string, any> = {};
  for (const [key, maxLength] of Object.entries(SIMPLE_FIELDS)) {
    result[key] = cleanSubmissionValue(raw?.[key], maxLength);
  }
  result.email = String(result.email || "").toLowerCase();
  result.bank_sort_code = digitsOnly(result.bank_sort_code, 6);
  result.bank_account_number = digitsOnly(result.bank_account_number, 8);
  result.declaration_accepted = raw?.declaration_accepted === true;
  result.qualifications = sanitizeQualifications(raw?.qualifications);
  return result;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateForSubmission(data: Record<string, any>) {
  const missing: string[] = [];
  if (!data.full_name) missing.push("full name");
  if (!data.phone) missing.push("phone number");
  if (!data.email || !isEmail(data.email)) missing.push("valid email address");
  if (!data.role) missing.push("role / trade");
  if (!data.address_line_1) missing.push("address line 1");
  if (!data.town_city) missing.push("town / city");
  if (!data.base_postcode) missing.push("postcode");
  if (!data.business_type) missing.push("business type");
  if (!data.bank_account_name) missing.push("bank account name");
  if (data.bank_sort_code.length !== 6) missing.push("valid 6-digit bank sort code");
  if (data.bank_account_number.length !== 8) missing.push("valid 8-digit bank account number");
  if (!data.emergency_contact_name) missing.push("emergency contact name");
  if (!data.emergency_contact_phone) missing.push("emergency contact phone");
  if (!data.declaration_accepted) missing.push("declaration confirmation");
  if (!data.declaration_name) missing.push("typed signature");
  return missing;
}

async function recordEvent(admin: any, inviteId: string, eventType: string, detail: any = {}) {
  const { error } = await admin.from("subcontractor_onboarding_events").insert({
    invite_id: inviteId,
    event_type: eventType,
    actor_type: "subcontractor",
    detail,
  });
  if (error) console.error("Could not record onboarding event", eventType, error.message);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    if (requestBodyTooLarge(request.headers, 128 * 1024)) {
      return NextResponse.json({ error: "The submitted form is too large." }, { status: 413 });
    }

    const admin = createSupabaseAdminClient();
    const resolved = await readInviteFromToken(admin, params.token);

    if (!resolved.invite) {
      const status = resolved.error === "expired" ? 410 : 404;
      return NextResponse.json({ error: "This secure link is invalid or expired." }, { status });
    }

    const invite = resolved.invite;
    if (!ONBOARDING_EDITABLE_STATUSES.has(invite.status)) {
      return NextResponse.json(
        { error: "This form is no longer editable.", status: invite.status },
        { status: 409 }
      );
    }

    const ipHash = hashOnboardingValue("ip", getClientIp(request.headers));
    await requireOnboardingRateLimit(admin, {
      keyHash: ipHash,
      action: "form_save_ip_hour",
      windowSeconds: 60 * 60,
      maxRequests: 60,
      inviteId: invite.id,
    });
    await requireOnboardingRateLimit(admin, {
      keyHash: hashOnboardingValue("invite", invite.id),
      action: "form_save_invite_hour",
      windowSeconds: 60 * 60,
      maxRequests: 120,
      inviteId: invite.id,
    });

    const body = await readJsonBodyLimited(request, 131072);
    const action = String(body?.action ?? "save").toLowerCase();
    if (action !== "save" && action !== "submit") {
      return NextResponse.json({ error: "Invalid form action." }, { status: 400 });
    }

    if (action === "submit") {
      await requireOnboardingRateLimit(admin, {
        keyHash: ipHash,
        action: "form_submit_ip_hour",
        windowSeconds: 60 * 60,
        maxRequests: 5,
        inviteId: invite.id,
      });
      await requireOnboardingRateLimit(admin, {
        keyHash: hashOnboardingValue("global", "form-submit"),
        action: "form_submit_global_hour",
        windowSeconds: 60 * 60,
        maxRequests: 25,
      });
    }

    const data = sanitizeSubmission(body?.data ?? {});

    if (data.email && !isEmail(data.email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (action === "submit") {
      const missing = validateForSubmission(data);
      if (missing.length) {
        return NextResponse.json(
          { error: `Please complete: ${missing.join(", ")}.` },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();
    const nextStatus = action === "submit" ? "submitted_for_review" : "in_progress";
    const updatePayload: Record<string, any> = {
      invitee_name: data.full_name || invite.invitee_name,
      invitee_email: data.email || invite.invitee_email || null,
      invitee_phone: data.phone || invite.invitee_phone || null,
      invited_role: data.role || invite.invited_role || null,
      submission_data: data,
      status: nextStatus,
      last_saved_at: now,
      updated_at: now,
    };

    if (!invite.first_opened_at) updatePayload.first_opened_at = now;
    if (action === "submit") {
      updatePayload.submitted_at = now;
      updatePayload.return_message = null;
      updatePayload.declaration_name = data.declaration_name;
      updatePayload.declaration_signed_at = now;
    }

    const { error } = await admin
      .from("subcontractor_onboarding_invites")
      .update(updatePayload)
      .eq("id", invite.id)
      .eq("token_version", invite.token_version)
      .in("status", Array.from(ONBOARDING_EDITABLE_STATUSES));

    if (error) throw error;

    await recordEvent(admin, invite.id, action === "submit" ? "submitted" : "saved", {
      email: data.email || null,
      ip_hash: ipHash,
    });

    if (action === "submit") {
      const notifyEmail = String(
        process.env.SUBCONTRACTOR_ONBOARDING_NOTIFY_EMAIL || "info@annscranehire.co.uk"
      ).trim();
      try {
        const origin = getOnboardingOrigin(request.nextUrl.origin);
        await sendSubcontractorOnboardingEmail({
          admin,
          to: notifyEmail,
          subject: `Subcontractor onboarding submitted - ${data.full_name}`,
          heading: "Subcontractor onboarding ready for review",
          paragraphs: [
            `${data.full_name} has completed and submitted the subcontractor onboarding form.`,
            `Role / trade: ${data.role || "Not stated"}.`,
            "Open the CRM to review the details, documents and approve or return the form for changes.",
          ],
          buttonLabel: "Review onboarding",
          buttonUrl: `${origin}/subcontractors/onboarding/${invite.id}`,
        });
        await admin.from("subcontractor_onboarding_events").insert({
          invite_id: invite.id,
          event_type: "office_notification_sent",
          actor_type: "system",
          detail: { email: notifyEmail },
        });
      } catch (emailError: any) {
        console.error("Subcontractor onboarding notification failed", emailError);
        await admin.from("subcontractor_onboarding_events").insert({
          invite_id: invite.id,
          event_type: "office_notification_failed",
          actor_type: "system",
          detail: {
            email: notifyEmail,
            error: String(emailError?.message || "Notification failed").slice(0, 500),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      status: nextStatus,
      message:
        action === "submit"
          ? "Your information has been submitted to AnnS Crane Hire for review."
          : "Progress saved.",
    });
  } catch (error: any) {
    console.error("Public subcontractor onboarding save failed", error);
    const response = publicApiError(error, "Could not save the onboarding form.");
    return NextResponse.json({ error: response.error }, { status: response.status });
  }
}
