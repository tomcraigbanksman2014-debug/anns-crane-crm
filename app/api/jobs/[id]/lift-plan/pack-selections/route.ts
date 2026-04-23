import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

type DynamicPackSectionsPayload = Record<string, string | null>;

function normaliseText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function sanitiseSections(input: Record<string, unknown>) {
  const next: DynamicPackSectionsPayload = {};

  for (const [key, value] of Object.entries(input)) {
    if (!key) continue;
    if (key.startsWith("$ACTION_")) continue;
    next[key] = normaliseText(value);
  }

  return next;
}

async function saveSections(jobId: string, sections: DynamicPackSectionsPayload) {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("lift_plans")
    .select("id, pack_sections")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const mergedSections = {
    ...((existing?.pack_sections as Record<string, unknown> | null) ?? {}),
    ...sections,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("lift_plans")
      .update({
        pack_sections: mergedSections,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("lift_plans").insert({
      job_id: jobId,
      pack_sections: mergedSections,
    });

    if (error) throw new Error(error.message);
  }

  return mergedSections;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const contentType = String(request.headers.get("content-type") ?? "").toLowerCase();
  const wantsJson = contentType.includes("application/json");

  try {
    let sections: DynamicPackSectionsPayload;

    if (wantsJson) {
      const body = (await request.json()) as Record<string, unknown>;
      sections = sanitiseSections(body);
    } else {
      const formData = await request.formData();
      const formValues: Record<string, unknown> = {};
      for (const [key, value] of formData.entries()) {
        formValues[key] = value;
      }
      sections = sanitiseSections(formValues);
    }

    const mergedSections = await saveSections(params.id, sections);

    if (wantsJson) {
      return NextResponse.json({ ok: true, pack_sections: mergedSections });
    }

    const redirectUrl = new URL(`/jobs/${params.id}/lift-plan/pack?saved=1`, request.url);
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error: any) {
    if (wantsJson) {
      return NextResponse.json(
        { error: error?.message || "Failed to save pack edits" },
        { status: 500 }
      );
    }

    const redirectUrl = new URL(
      `/jobs/${params.id}/lift-plan/pack?error=${encodeURIComponent(
        error?.message || "Failed to save pack edits"
      )}`,
      request.url
    );
    return NextResponse.redirect(redirectUrl, 303);
  }
}
