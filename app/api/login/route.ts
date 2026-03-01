import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// Simple signed cookie token: base64url(payload).base64url(hmacSHA256(payload))
function signToken(payloadObj: any, secret: string) {
  const payloadJson = JSON.stringify(payloadObj);
  const payload = base64url(payloadJson);
  const sig = base64url(crypto.createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const username = (body?.username ?? "").toString().trim();
    const password = (body?.password ?? "").toString();

    if (!username || !password) {
      return new NextResponse("Missing username or password", { status: 400 });
    }

    // Supabase (server-side)
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Look up staff user
    const { data, error } = await supabase
      .from("staff_users")
      .select("username, password_hash")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("Supabase error:", error);
      return new NextResponse("Server error", { status: 500 });
    }

    if (!data?.password_hash) {
      return new NextResponse("Invalid username or password", { status: 401 });
    }

    const ok = await bcrypt.compare(password, data.password_hash);
    if (!ok) {
      return new NextResponse("Invalid username or password", { status: 401 });
    }

    // Sign cookie
    const secret = getEnv("ADMIN_CREATE_USER_TOKEN"); // reuse your existing secret env
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 24 * 7; // 7 days

    const token = signToken(
      {
        sub: data.username,
        iat: now,
        exp,
        v: 1,
      },
      secret
    );

    const res = NextResponse.json({ ok: true });

    res.cookies.set("staff_session", token, {
      httpOnly: true,
      secure: true, // Vercel is https
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (e: any) {
    console.error(e);
    return new NextResponse(e?.message || "Server error", { status: 500 });
  }
}
