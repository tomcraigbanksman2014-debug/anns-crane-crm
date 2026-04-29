import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

function normaliseEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanUuid(value: unknown) {
  const text = String(value ?? "").trim();

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      text
    )
  ) {
    return text;
  }

  return null;
}

async function applyUnsubscribe(args: {
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
}) {
  const admin = createSupabaseAdminClient();

  const { data: tokenRow, error: tokenError } = await admin
    .from("marketing_unsubscribe_tokens")
    .select("*")
    .eq("token", args.token)
    .maybeSingle();

  if (tokenError) {
    throw new Error(tokenError.message);
  }

  if (!tokenRow) {
    return {
      ok: false,
      status: 404,
      message: "This unsubscribe link is invalid or has expired.",
    };
  }

  const email = String((tokenRow as any).email ?? "").trim();
  const emailNormalized = normaliseEmail((tokenRow as any).email_normalized || email);

  if (!emailNormalized) {
    return {
      ok: false,
      status: 400,
      message: "This unsubscribe link is missing an email address.",
    };
  }

  const targetType = String((tokenRow as any).target_type ?? "").trim() || null;
  const targetId = cleanUuid((tokenRow as any).target_id);
  const campaignId = cleanUuid((tokenRow as any).campaign_id);

  const { error: unsubscribeError } = await admin
    .from("marketing_unsubscribes")
    .upsert(
      [
        {
          email,
          email_normalized: emailNormalized,
          target_type: targetType,
          target_id: targetId,
          campaign_id: campaignId,
          source: "one_click",
          reason: "Unsubscribed using campaign unsubscribe link.",
          unsubscribed_at: new Date().toISOString(),
        },
      ],
      { onConflict: "email_normalized" }
    );

  if (unsubscribeError) {
    throw new Error(unsubscribeError.message);
  }

  await admin
    .from("marketing_unsubscribe_tokens")
    .update({
      used_at: new Date().toISOString(),
      user_agent: args.userAgent,
      ip_address: args.ipAddress,
    })
    .eq("token", args.token);

  if (targetType === "lead" && targetId) {
    await admin
      .from("sales_leads")
      .update({
        do_not_contact: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetId);
  }

  return {
    ok: true,
    status: 200,
    message: "You have been removed from AnnS Crane Hire marketing emails.",
    email,
  };
}

export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const token = String(params.token ?? "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing unsubscribe token." }, { status: 400 });
    }

    const result = await applyUnsubscribe({
      token,
      userAgent: req.headers.get("user-agent"),
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      email: result.email,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not unsubscribe this email." },
      { status: 500 }
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: { token: string } }
) {
  const url = new URL(`/unsubscribe/${params.token}`, req.url);
  return NextResponse.redirect(url, { status: 303 });
}
