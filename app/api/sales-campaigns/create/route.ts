import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { writeAuditLog } from "../../../lib/audit";
import { isMasterAdminEmail } from "../../../lib/admin";

const STATUSES = new Set(["Draft", "Active", "Completed", "Cancelled"]);
const CHANNELS = new Set(["email", "text", "linkedin"]);
const GOALS = new Set([
  "introduction",
  "recent_customer_thank_you",
  "dormant_recovery",
  "quote_follow_up",
  "cross_sell",
  "follow_up",
  "reactivation",
  "availability",
]);
const TONES = new Set(["professional", "friendly", "direct"]);
const RECIPIENT_SOURCES = new Set([
  "job_quote_first",
  "booking_contacts_only",
  "customer_email_only",
  "include_accounts_fallback",
]);

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean)));
}

function redirectBack(req: Request, message: string) {
  const url = new URL("/sales-hub/campaigns", req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, { status: 303 });
}

function redirectToRunner(req: Request, campaignId: string, message: string) {
  const url = new URL(`/sales-hub/campaigns/${campaignId}/runner`, req.url);
  url.searchParams.set("success", message);
  return NextResponse.redirect(url, { status: 303 });
}

async function insertCampaignWithRecipientSourceFallback(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  payload: Record<string, any>;
}) {
  const { error } = await args.admin.from("sales_campaigns").insert([args.payload]);

  if (!error) return null;

  const message = String(error.message ?? "");
  const missingRecipientSourceColumn =
    message.includes("recipient_source") ||
    message.toLowerCase().includes("column") && message.toLowerCase().includes("recipient_source");

  if (!missingRecipientSourceColumn) return error;

  const fallbackPayload = { ...args.payload };
  delete fallbackPayload.recipient_source;

  const { error: fallbackError } = await args.admin.from("sales_campaigns").insert([fallbackPayload]);
  return fallbackError ?? null;
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const fail = (message: string, status = 400) =>
    isJson
      ? NextResponse.json({ error: message }, { status })
      : redirectBack(req, message);

  try {
    const authSupabase = createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser();

    if (userError || !user) {
      return fail("Not authenticated", 401);
    }

    const userEmail = String(user.email ?? "").trim().toLowerCase();
    const userRole = String((user.user_metadata as any)?.role ?? "").trim().toLowerCase();

    const admin = createSupabaseAdminClient();

    let canManage = false;
    if (isMasterAdminEmail(userEmail) || userRole === "admin" || userRole === "staff") {
      canManage = true;
    } else {
      const { data: staffRows, error: staffError } = await admin
        .from("staff_profiles")
        .select("role, disabled")
        .eq("user_id", user.id)
        .limit(1);

      if (staffError) {
        return fail(`Permission lookup failed: ${staffError.message}`);
      }

      const staffRow = Array.isArray(staffRows) ? staffRows[0] : null;
      const role = String((staffRow as any)?.role ?? "").trim().toLowerCase();
      const disabled = Boolean((staffRow as any)?.disabled ?? false);
      if (!disabled && (role === "admin" || role === "staff")) {
        canManage = true;
      }
    }

    if (!canManage) {
      return fail("You do not have permission to create campaigns.", 403);
    }

    let source: any = {};
    let formData: FormData | null = null;

    if (isJson) {
      source = await req.json().catch(() => ({}));
    } else {
      formData = await req.formData().catch(() => null);
      source = formData ?? {};
    }

    const getValue = (key: string) => {
      if (formData) return formData.get(key);
      return source?.[key];
    };

    const getAllValues = (key: string) => {
      if (formData) return formData.getAll(key);
      const raw = source?.[key];
      return Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    };

    const name = clean(getValue("name"));
    const description = clean(getValue("description"));
    const status = STATUSES.has(String(getValue("status") ?? "")) ? String(getValue("status")) : "Draft";
    const channel = CHANNELS.has(String(getValue("channel") ?? "")) ? String(getValue("channel")) : "email";
    const incomingGoal = String(getValue("goal") ?? "").trim();
    const goal = GOALS.has(incomingGoal) ? incomingGoal : "introduction";
    const tone = TONES.has(String(getValue("tone") ?? "")) ? String(getValue("tone")) : "professional";
    const incomingRecipientSource = String(getValue("recipient_source") ?? "").trim();
    const recipientSource = RECIPIENT_SOURCES.has(incomingRecipientSource)
      ? incomingRecipientSource
      : "job_quote_first";
    const templateId = clean(getValue("template_id"));
    const serviceFocus = clean(getValue("service_focus"));
    const availabilityNote = clean(getValue("availability_note"));
    const scheduledFor = clean(getValue("scheduled_for"));

    const selectAllLeads = String(getValue("select_all_leads") ?? "") === "1";
    const selectAllCustomers = String(getValue("select_all_customers") ?? "") === "1";
    const leadIds = selectAllLeads
      ? uniqueStrings(String(getValue("all_lead_ids") ?? "").split(","))
      : uniqueStrings(getAllValues("lead_ids"));

    const customerIds = selectAllCustomers
      ? uniqueStrings(String(getValue("all_customer_ids") ?? "").split(","))
      : uniqueStrings(getAllValues("customer_ids"));

    if (!name) {
      return fail("Campaign name is required.");
    }

    if (!leadIds.length && !customerIds.length) {
      return fail("Select at least one lead or customer.");
    }

    const campaignId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const createdByUsername = fromAuthEmail(user.email ?? null) || null;

    const campaignError = await insertCampaignWithRecipientSourceFallback({
      admin,
      payload: {
        id: campaignId,
        name,
        description,
        status,
        channel,
        goal,
        tone,
        recipient_source: recipientSource,
        template_id: templateId,
        service_focus: serviceFocus,
        availability_note: availabilityNote,
        scheduled_for: scheduledFor,
        created_by_user_id: user.id,
        created_by_username: createdByUsername,
      },
    });

    if (campaignError) {
      return fail(`Campaign insert failed: ${campaignError.message}`);
    }

    if (leadIds.length) {
      const { error: linkError } = await admin
        .from("sales_campaign_leads")
        .insert(leadIds.map((leadId) => ({ campaign_id: campaignId, lead_id: leadId })));

      if (linkError) {
        await admin.from("sales_campaigns").delete().eq("id", campaignId);
        return fail(`Lead link failed: ${linkError.message}`);
      }

      await admin.from("sales_lead_activity").insert(
        leadIds.map((leadId) => ({
          lead_id: leadId,
          entry_type: "campaign",
          subject: `Added to campaign: ${name}`,
          message: `Lead added to campaign "${name}" via Sales Hub Campaign Execution.`,
          created_by_user_id: user.id,
          created_by_username: createdByUsername,
        }))
      );
    }

    if (customerIds.length) {
      const { error: customerLinkError } = await admin
        .from("sales_campaign_customers")
        .insert(customerIds.map((clientId) => ({ campaign_id: campaignId, client_id: clientId })));

      if (customerLinkError) {
        await admin.from("sales_campaign_leads").delete().eq("campaign_id", campaignId);
        await admin.from("sales_campaigns").delete().eq("id", campaignId);
        return fail(`Customer link failed: ${customerLinkError.message}`);
      }

      await admin.from("customer_correspondence").insert(
        customerIds.map((clientId) => ({
          client_id: clientId,
          entry_type: "campaign",
          subject: `Added to campaign: ${name}`,
          message: `Customer added to campaign "${name}" via Sales Hub Campaign Execution.`,
          created_by_user_id: user.id,
          created_by_username: createdByUsername,
        }))
      );
    }

    // Supplier/cross-hire campaign targeting has been removed from the campaign engine.

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: createdByUsername,
      action: "sales_campaign_created",
      entity_type: "sales_campaign",
      entity_id: campaignId,
      meta: {
        name,
        status,
        channel,
        goal,
        tone,
        recipient_source: recipientSource,
        template_id: templateId,
        selected_lead_count: leadIds.length,
        selected_customer_count: customerIds.length,
        selected_supplier_count: 0,
        service_focus: serviceFocus,
      },
    });

    return isJson
      ? NextResponse.json({ ok: true, id: campaignId })
      : redirectToRunner(req, campaignId, "Campaign created.");
  } catch (e: any) {
    return fail(`Create campaign failed: ${e?.message || "Unknown error"}`, 500);
  }
}
