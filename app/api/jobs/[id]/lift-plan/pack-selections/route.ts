import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

type DynamicPackSectionsPayload = Record<string, string | null>;

const LONG_TEXT_SECTION_KEYS = new Set([
  "introduction",
  "client_responsibilities",
  "contract_lift_arrival",
  "scope_of_works",
  "communication",
  "weather_conditions",
  "site_access_egress",
  "ground_conditions",
  "overhead_obstructions",
  "traffic_pedestrian_management",
  "lifting_equipment_certification",
  "crane_details",
  "crane_setup_procedure",
  "lifting_procedure",
  "de_rig_procedure",
  "emergency_procedure",
  "risk_assessment_summary",
  "emergency_contacts",
  "equipment_list",
  "toolbox_notes",
  "range_chart_verification_note",
]);

function normaliseDuplicateKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9.%/()'" -]/g, "")
    .trim();
}

function tidyRepeatedTextBlock(value: string) {
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const seenParagraphs = new Set<string>();
  const uniqueParagraphs: string[] = [];

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    const sentenceParts = paragraph
      .replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1\n")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const seenSentences = new Set<string>();
    const uniqueSentences: string[] = [];
    for (const sentence of sentenceParts.length ? sentenceParts : [paragraph]) {
      const key = normaliseDuplicateKey(sentence);
      if (!key || seenSentences.has(key)) continue;
      seenSentences.add(key);
      uniqueSentences.push(sentence);
    }
    const cleanedParagraph = uniqueSentences.join(" ").trim();
    const paragraphKey = normaliseDuplicateKey(cleanedParagraph);
    if (!paragraphKey || seenParagraphs.has(paragraphKey)) continue;
    seenParagraphs.add(paragraphKey);
    uniqueParagraphs.push(cleanedParagraph);
  }

  return uniqueParagraphs.join("\n\n").trim();
}

function normaliseText(key: string, value: unknown) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim();
  if (LONG_TEXT_SECTION_KEYS.has(key)) text = tidyRepeatedTextBlock(text);
  return text.length ? text : null;
}

function sanitiseSections(input: Record<string, unknown>) {
  const next: DynamicPackSectionsPayload = {};

  Object.entries(input).forEach(([key, value]) => {
    if (!key) return;
    if (key.startsWith("$ACTION_")) return;
    next[key] = normaliseText(key, value);
  });

  return next;
}

async function saveSections(jobId: string, sections: DynamicPackSectionsPayload) {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("lift_plans")
    .select("id, pack_sections, paperwork_locked")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.paperwork_locked) {
    throw new Error("This lift plan is locked and cannot be edited.");
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
      formData.forEach((value, key) => {
        formValues[key] = value;
      });
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
