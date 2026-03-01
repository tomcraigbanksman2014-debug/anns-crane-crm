import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password required" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: "Server misconfigured (missing Supabase env vars)" },
        { status: 500 }
      );
    }

    // Service role key MUST only be used server-side (API route is server-side)
    const supabase = createClient(url, serviceKey);

    const { data, error } = await supabase
      .from("staff_users")
      .select("username, password_hash")
      .eq("username", username)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const hash = String(data.password_hash ?? "");
    const valid = await bcrypt.compare(password, hash);

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ success: true });

    // Cookie used by middleware to protect routes
    res.cookies.set("staff_user", username, {
      httpOnly: true,
      secure: true, // OK on Vercel (https)
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
    });

    return res;
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
