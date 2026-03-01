// app/api/admin/create-user/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

// Hash password with scrypt (built-in Node crypto) ✅
// Stored format: scrypt$<saltBase64>$<hashBase64>
function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function POST(req: Request) {
  try {
    const adminToken = request.headers.get("x-admin-token");

if (adminToken !== process.env.ADMIN_CREATE_USER_TOKEN) {
  return new Response("Unauthorized", { status: 401 });
}
    // Simple admin protection (so staff can’t call this endpoint)
    // Set ADMIN_CREATE_USER_TOKEN in Vercel env vars
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!process.env.ADMIN_CREATE_USER_TOKEN || token !== process.env.ADMIN_CREATE_USER_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || username.length < 3) {
      return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Server-side Supabase client using SERVICE ROLE (never expose this to the browser)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Ensure username is unique
    const { data: existing, error: existingErr } = await supabase
      .from("staff_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }

    const password_hash = hashPassword(password);

    const { data, error } = await supabase
      .from("staff_users")
      .insert([{ username, password_hash }])
      .select("id, username, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
