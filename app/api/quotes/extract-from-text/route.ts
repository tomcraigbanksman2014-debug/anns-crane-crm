import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { extractQuoteFromTextWithFallback } from "../../../lib/ai/quoteExtraction";

type Payload = {
  source_text?: string | null;
};

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;
    const sourceText = String(body.source_text ?? "").trim();

    if (!sourceText) {
      return NextResponse.json({ error: "Source text is required" }, { status: 400 });
    }

    const result = await extractQuoteFromTextWithFallback(sourceText);

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      extraction: result.extraction,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to extract quote fields" },
      { status: 400 }
    );
  }
}
