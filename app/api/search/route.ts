import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { runGlobalSearch } from "../../lib/global-search";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") ?? "");
    const type = String(url.searchParams.get("type") ?? "all").toLowerCase() as any;
    const limitRaw = Number(url.searchParams.get("limit") ?? 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 50)) : 10;

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const results = await runGlobalSearch(supabase, q, type, limit);

    return NextResponse.json({
      query: results.query,
      grouped: results.grouped,
      results: results.flat,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Search failed." },
      { status: 400 }
    );
  }
}
