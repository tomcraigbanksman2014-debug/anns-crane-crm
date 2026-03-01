import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Supports hashes that look like: scrypt$N$r$p$salt$hash  (Supabase/GoTrue style)
function verifyScrypt(password: string, encoded: string): boolean {
  const parts = encoded.split("$");
  // Expect: ["scrypt", N, r, p, salt, hash]
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltB64 = parts[4];
  const hashB64 = parts[5];

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");

  const derived = crypto.scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: 128 * 1024 * 1024, // 128MB safety cap
  });

  return crypto.timingSafeEqual(derived, expected);
}

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("staff_users")
      .select("id, username, password_hash")
      .eq("username", username)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const stored = data.password_hash as string;

    let ok = false;

    if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
      ok = await bcrypt.compare(password, stored);
    } else if (stored.startsWith("scrypt$")) {
      ok = verifyScrypt(password, stored);
    } else {
      // Unknown hash type
      ok = false;
    }

    if (!ok) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    // Simple session cookie (you can upgrade later)
    const res = NextResponse.json({ ok: true });
    res.cookies.set("staff_user", data.username, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
    });
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
