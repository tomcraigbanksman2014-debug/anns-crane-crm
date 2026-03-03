import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET() {
  // Verify requester is logged in + admin (using cookie session)
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  const role = (auth.user?.user_metadata as any)?.role ?? null;
  if (!auth.user || role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY; // fallback (you said yours starts sb_secret...)

  if (!serviceKey) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY" },
      { status: 500 }
    );
  }

  // Admin client can list users
  const admin = createClient(url, serviceKey);

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (data?.users || []).map((u: any) => ({
    id: u.id,
    email: u.email ?? null,
    created_at: u.created_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    role: u.user_metadata?.role ?? null,
  }));

  return NextResponse.json({ users });
}
