import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const adminToken = request.headers.get("x-admin-token");

  if (adminToken !== process.env.ADMIN_CREATE_USER_TOKEN) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { username, password } = await request.json();

  if (!username || !password) {
    return new NextResponse("Username and password required", { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const existing = await supabase
    .from("staff_users")
    .select("id")
    .eq("username", username)
    .single();

  if (existing.data) {
    return new NextResponse("Username already exists", { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);

  const { error } = await supabase.from("staff_users").insert({
    username,
    password_hash: hash,
  });

  if (error) {
    return new NextResponse("Database error", { status: 500 });
  }

  return NextResponse.json({ success: true });
}
