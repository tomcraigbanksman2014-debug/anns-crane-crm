import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const body = await req.json();
    const { data, error } = await supabase
      .from("bookings")
      .insert([body])
      .select("id")
      .single();

    if (error) {
      // Exclusion constraint violation (double booking)
      if ((error as any).code === "23P01") {
        return NextResponse.json(
          { error: "That equipment is already booked for the selected dates." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
