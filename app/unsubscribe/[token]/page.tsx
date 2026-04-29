import type { CSSProperties } from "react";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";

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

async function unsubscribe(token: string) {
  const admin = createSupabaseAdminClient();

  const { data: tokenRow, error: tokenError } = await admin
    .from("marketing_unsubscribe_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (tokenError) {
    return {
      ok: false,
      title: "Unsubscribe failed",
      message: tokenError.message,
    };
  }

  if (!tokenRow) {
    return {
      ok: false,
      title: "Invalid unsubscribe link",
      message: "This unsubscribe link is invalid or has already been removed.",
    };
  }

  const email = String((tokenRow as any).email ?? "").trim();
  const emailNormalized = normaliseEmail((tokenRow as any).email_normalized || email);
  const targetType = String((tokenRow as any).target_type ?? "").trim() || null;
  const targetId = cleanUuid((tokenRow as any).target_id);
  const campaignId = cleanUuid((tokenRow as any).campaign_id);

  if (!emailNormalized) {
    return {
      ok: false,
      title: "Unsubscribe failed",
      message: "This unsubscribe link is missing an email address.",
    };
  }

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
          source: "campaign_link",
          reason: "Unsubscribed using campaign unsubscribe page.",
          unsubscribed_at: new Date().toISOString(),
        },
      ],
      { onConflict: "email_normalized" }
    );

  if (unsubscribeError) {
    return {
      ok: false,
      title: "Unsubscribe failed",
      message: unsubscribeError.message,
    };
  }

  await admin
    .from("marketing_unsubscribe_tokens")
    .update({
      used_at: new Date().toISOString(),
    })
    .eq("token", token);

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
    title: "You have been unsubscribed",
    message: "You have been removed from AnnS Crane Hire marketing emails.",
    email,
  };
}

export default async function UnsubscribePage({
  params,
}: {
  params: { token: string };
}) {
  const token = String(params.token ?? "").trim();
  const result = token
    ? await unsubscribe(token)
    : {
        ok: false,
        title: "Invalid unsubscribe link",
        message: "No unsubscribe token was supplied.",
      };

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <img src="/logo.png" alt="AnnS Crane Hire" style={logoStyle} />

        <h1 style={{ margin: "18px 0 0", fontSize: 30 }}>{result.title}</h1>

        <p style={{ marginTop: 12, fontSize: 17, lineHeight: 1.5, opacity: 0.82 }}>
          {result.message}
        </p>

        {"email" in result && result.email ? (
          <div style={emailBoxStyle}>{result.email}</div>
        ) : null}

        <p style={{ marginTop: 18, fontSize: 14, opacity: 0.65 }}>
          This only removes you from marketing emails. Operational emails about live jobs,
          quotes, invoices or bookings may still be sent where required.
        </p>

        <a href="https://www.annscranehire.co.uk/" style={buttonStyle}>
          Visit AnnS Crane Hire
        </a>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#dfeaf5",
  display: "grid",
  placeItems: "center",
  padding: 18,
};

const cardStyle: CSSProperties = {
  width: "min(620px, 94vw)",
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 18,
  padding: 28,
  textAlign: "center",
  boxShadow: "0 12px 40px rgba(0,0,0,0.10)",
};

const logoStyle: CSSProperties = {
  width: 110,
  height: "auto",
  objectFit: "contain",
};

const emailBoxStyle: CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,0,0,0.06)",
  fontWeight: 900,
  wordBreak: "break-word",
};

const buttonStyle: CSSProperties = {
  display: "inline-block",
  marginTop: 18,
  padding: "11px 15px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
};
