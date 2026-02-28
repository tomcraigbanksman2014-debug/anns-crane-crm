import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data: user, error } = await supabase
      .from("staff_users")
      .select("*")
      .eq("username", username.toLowerCase())
      .single();

    if (error || !user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
