import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { getAccessContext } from "../../lib/access";

export const dynamic = "force-dynamic";

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function cleanText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.slice(0, maxLength);
}

function validHref(value: unknown) {
  const href = cleanText(value, 180);

  if (!href) return "";
  if (!href.startsWith("/")) return "";
  if (href.startsWith("//")) return "";
  if (href.startsWith("/api")) return "";
  if (href.startsWith("/login")) return "";
  if (href.startsWith("/change-password")) return "";
  if (href.startsWith("/operator")) return "";

  return href;
}

async function getSignedInOfficeUser() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, access: null, error: "Not signed in" };
  }

  const access = await getAccessContext();

  if (access.role !== "admin" && access.role !== "staff") {
    return { user, access, error: "Office access required." };
  }

  return { user, access, error: "" };
}

export async function GET() {
  try {
    const { user, access, error } = await getSignedInOfficeUser();

    if (!user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    if (error) {
      return NextResponse.json({ items: [] });
    }

    const admin = createSupabaseAdminClient();

    const { data, error: readError } = await admin
      .from("user_menu_usage")
      .select("href, label, click_count, last_used_at")
      .eq("user_id", user.id)
      .order("click_count", { ascending: false })
      .order("last_used_at", { ascending: false })
      .limit(8);

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      items: data ?? [],
      role: access?.role ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not load menu usage." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { user, access, error } = await getSignedInOfficeUser();

    if (!user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    if (error) {
      return NextResponse.json({ error }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const href = validHref(body?.href);
    const label = cleanText(body?.label, 80);

    if (!href || !label) {
      return NextResponse.json({ error: "Valid menu item required." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const { data: existing, error: lookupError } = await admin
      .from("user_menu_usage")
      .select("id, click_count")
      .eq("user_id", user.id)
      .eq("href", href)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 400 });
    }

    if (existing?.id) {
      const { error: updateError } = await admin
        .from("user_menu_usage")
        .update({
          label,
          role: access?.role ?? null,
          username: fromAuthEmail(user.email ?? null) || null,
          click_count: Number(existing.click_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    const { error: insertError } = await admin.from("user_menu_usage").insert([
      {
        user_id: user.id,
        username: fromAuthEmail(user.email ?? null) || null,
        role: access?.role ?? null,
        href,
        label,
        click_count: 1,
        first_used_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not save menu usage." },
      { status: 500 }
    );
  }
}
