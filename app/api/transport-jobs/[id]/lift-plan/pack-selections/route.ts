import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

type PackSectionsPayload = Record<string, string | null | undefined>;

function normaliseText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServerClient();
    const body = (await request.json()) as PackSectionsPayload;

    const sections = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key, normaliseText(value)])
    );

    const { data: existing, error: existingError } = await supabase
      .from("transport_lift_plans")
      .select("id, pack_sections")
      .eq("transport_job_id", params.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    const mergedSections = {
      ...((existing?.pack_sections as Record<string, unknown> | null) ?? {}),
      ...sections,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("transport_lift_plans")
        .update({
          pack_sections: mergedSections,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      const { error } = await supabase
        .from("transport_lift_plans")
        .insert({
          transport_job_id: params.id,
          pack_sections: mergedSections,
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, pack_sections: mergedSections });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save transport pack section content" },
      { status: 500 }
    );
  }
}
