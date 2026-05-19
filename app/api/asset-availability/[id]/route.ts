import { NextResponse } from "next/server";
import { requireApiUser } from "../../../lib/apiAuth";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, response } = await requireApiUser();
    if (response) return response;

    const id = String(params.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Downtime id missing." }, { status: 400 });
    }

    const { error } = await supabase.from("asset_availability").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not remove asset downtime." },
      { status: 400 }
    );
  }
}
