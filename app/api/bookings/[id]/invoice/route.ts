import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function money(n: any) {
  const num = Number(n ?? 0);
  if (Number.isNaN(num)) return "£0.00";
  return num.toLocaleString(undefined, { style: "currency", currency: "GBP" });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      `
        id,
        start_date,
        end_date,
        location,
        status,
        hire_price,
        vat,
        total_invoice,
        payment_received,
        invoice_status,
        created_at,
        clients ( id, company_name, contact_name, phone, email ),
        equipment ( id, name, asset_number, type, capacity )
      `
    )
    .eq("id", params.id)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const client = first<any>(booking.clients);
  const equip = first<any>(booking.equipment);

  // Build PDF
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = 780;

  const draw = (text: string, size = 11, isBold = false) => {
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: isBold ? bold : font,
    });
    y -= size + 8;
  };

  draw("AnnS Crane Hire", 20, true);
  draw("Invoice (Booking)", 14, true);
  y -= 6;

  draw(`Booking ID: ${booking.id}`, 10);
  draw(`Invoice status: ${booking.invoice_status ?? "-"}`, 10);
  draw(`Status: ${booking.status ?? "-"}`, 10);
  y -= 6;

  draw("Customer", 12, true);
  draw(`Company: ${client?.company_name ?? "-"}`, 10);
  draw(`Contact: ${client?.contact_name ?? "-"}`, 10);
  draw(`Phone: ${client?.phone ?? "-"}`, 10);
  draw(`Email: ${client?.email ?? "-"}`, 10);
  y -= 6;

  draw("Booking details", 12, true);
  draw(`Dates: ${booking.start_date ?? "-"} to ${booking.end_date ?? "-"}`, 10);
  draw(`Location: ${booking.location ?? "-"}`, 10);
  draw(
    `Equipment: ${equip?.name ?? "-"} (${equip?.asset_number ?? "-"})`,
    10
  );
  draw(`Type/Capacity: ${equip?.type ?? "-"} • ${equip?.capacity ?? "-"}`, 10);
  y -= 6;

  draw("Charges", 12, true);
  draw(`Hire price: ${money(booking.hire_price)}`, 11);
  draw(`VAT: ${money(booking.vat)}`, 11);
  draw(`Total: ${money(booking.total_invoice)}`, 12, true);
  draw(`Payment received: ${money(booking.payment_received)}`, 11);

  y -= 16;
  page.drawText("Thank you for your business.", {
    x: margin,
    y,
    size: 11,
    font,
  });

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${booking.id}.pdf"`,
    },
  });
}
