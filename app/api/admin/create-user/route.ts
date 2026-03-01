import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    // ✅ Protect this endpoint with a server-side token
    const adminToken = request.headers.get("x-admin-token");
    if (!process.env.ADMIN_CREATE_USER_TOKEN) {
      return new Response("Missing ADMIN_CREATE_USER_TOKEN env var", {
        status: 500,
      });
    }
    if (adminToken !== process.env.ADMIN_CREATE_USER_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }

    // ✅ Read payload
    const body = await request.json();
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    if (!username || username.length < 3) {
      return new Response("Username must be at least 3 characters.", {
        status: 400,
      });
    }
    if (!password || password.length < 6) {
      return new Response("Password must be at least 6 characters.", {
        status: 400,
      });
    }

    // ✅ Create server Supabase client using service role key (server-only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return new Response("Missing NEXT_PUBLIC_SUPABASE_URL env var", {
        status: 500,
      });
    }
    if (!serviceRoleKey) {
      return new Response("Missing SUPABASE_SERVICE_ROLE_KEY env var", {
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ✅ Check existing username
    const { data: existing, error: existingErr } = await supabase
      .from("staff_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existingErr) {
      return new Response(`DB error checking username: ${existingErr.message}`, {
        status: 500,
      });
    }
    if (existing) {
      return new Response("Username already exists.", { status: 409 });
    }

    // ✅ Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // ✅ Insert staff user
    const { error: insertErr } = await supabase.from("staff_users").insert({
      username,
      password_hash,
    });

    if (insertErr) {
      return new Response(`DB error inserting user: ${insertErr.message}`, {
        status: 500,
      });
    }

    return Response.json({ ok: true, username });
  } catch (e: any) {
    return new Response(e?.message ?? "Unknown error", { status: 500 });
  }
}
