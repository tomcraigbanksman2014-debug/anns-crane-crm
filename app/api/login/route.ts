import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { NextResponse } from "next/server";

function base64ToBuffer(b64: string) {
  return Buffer.from(b64, "base64");
}

/**
 * Supports hashes stored like:
 * scrypt$<salt_base64>$<derivedKey_base64>
 *
 * This matches the common Node crypto scrypt defaults:
 * N=16384, r=8, p=1, keylen=64
 */
async function verifyScrypt(password: string, stored: string) {
  const parts = stored.split("$");
  // ["scrypt", "<saltB64>", "<keyB64>"]
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = base64ToBuffer(parts[1]);
  const expected = base64ToBuffer(parts[2]);

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      expected.length,
      { N: 16384, r: 8, p: 1 },
      (err, key) => {
        if (err) reject(err);
        else resolve(key as Buffer);
      }
    );
  });

  // constant-time compare
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password required" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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

  const hash = data.password_hash as string;

  let valid = false;

  // ✅ If it's a bcrypt hash
  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    valid = await bcrypt.compare(password, hash);
  }

  // ✅ If it's a scrypt hash
  else if (hash.startsWith("scrypt$")) {
    valid = await verifyScrypt(password, hash);
  }

  // Unknown format
  else {
    valid = false;
  }

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ success: true });

  res.cookies.set("staff_user", username, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return res;
}
