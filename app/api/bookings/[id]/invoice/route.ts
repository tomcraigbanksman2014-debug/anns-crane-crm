import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { PDFDocument, StandardFonts } from "pdf-lib";

function moneyGBP(n: any) {
  const num = Number(n ?? 0);
  if (!Number.isFinite(num)) return "£0.00";
  return num.toLocaleString(undefined, { style: "currency", currency: "GBP" });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d + "T00:00:00").toLocaleDateString();
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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
      invoice_status,
      payment_received,
      created_at,
      clients:client_id ( id, company_name, contact_name, phone, email ),
      equipment:equipment_id ( id, name, asset_number, type, capacity )
    `
    )
    .eq("id", params.id)
    .single();

  if (error || !booking) {
    return NextResponse.json(
      { error: error?.message ?? "Booking not found" },
      { status: 404 }
    );
  }

  const client = first<any>(booking.clients);
  const equip = first<any>(booking.equipment);

  // --- Build PDF ---
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 790;

  const drawText = (
    text: string,
    x: number,
    y: number,
    size = 11,
    isBold = false
  ) => {
    page.drawText(text, { x, y, size, font: isBold ? bold : font });
  };

  // Header
  drawText("Ann’s Crane Hire", margin, y, 18, true);
  y -= 22;
  drawText("INVOICE", margin, y, 14, true);

  // Right side details
  drawText(`Invoice date: ${new Date().toLocaleDateString()}`, 350, 790, 10);
  drawText(`Booking ID: ${booking.id}`, 350, 775, 10);

  y -= 35;

  // Bill To
  drawText("Bill To", margin, y, 12, true);
  y -= 18;
  drawText(client?.company_name ?? "-", margin, y, 11, true);
  y -= 14;
  drawText(`Contact: ${client?.contact_name ?? "-"}`, margin, y);
  y -= 14;
  drawText(`Phone: ${client?.phone ?? "-"}`, margin, y);
  y -= 14;
  drawText(`Email: ${client?.email ?? "-"}`, margin, y);

  // Booking details box
  y -= 26;
  drawText("Booking Details", margin, y, 12, true);
  y -= 18;
  drawText(`Start: ${fmtDate(booking.start_date)}`, margin, y);
  drawText(`End: ${fmtDate(booking.end_date)}`, 260, y);
  y -= 14;
  drawText(`Location: ${booking.location ?? "-"}`, margin, y);
  y -= 14;
  drawText(`Status: ${booking.status ?? "-"}`, margin, y);
  y -= 14;
  drawText(`Equipment: ${equip?.name ?? "-"}`, margin, y);
  y -= 14;
  drawText(`Asset #: ${equip?.asset_number ?? "-"}`, margin, y);
  y -= 14;
  drawText(
    `Type/Capacity: ${(equip?.type ?? "-")} / ${(equip?.capacity ?? "-")}`,
    margin,
    y
  );

  // Line items
  y -= 28;
  drawText("Charges", margin, y, 12, true);
  y -= 16;

  // Table headers
  drawText("Description", margin, y, 10, true);
  drawText("Amount", 450, y, 10, true);
  y -= 12;

  const hire = Number(booking.hire_price ?? 0);
  const vat = Number(booking.vat ?? 0);
  const total = Number(booking.total_invoice ?? hire + vat);

  drawText("Hire charge", margin, y, 10);
  drawText(moneyGBP(hire), 450, y, 10);
  y -= 14;

  drawText("VAT", margin, y, 10);
  drawText(moneyGBP(vat), 450, y, 10);
  y -= 14;

  drawText("Total", margin, y, 11, true);
  drawText(moneyGBP(total), 450, y, 11, true);

  // Footer
  y -= 60;
  drawText("Payment terms: Due on receipt", margin, y, 10);
  y -= 12;
  drawText(`Invoice status: ${booking.invoice_status ?? "-"}`, margin, y, 10);
  y -= 12;
  drawText(
    `Payment received: ${moneyGBP(booking.payment_received ?? 0)}`,
    margin,
    y,
    10
  );

  const bytes = await pdf.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${booking.id}.pdf"`,
    },
  });
}
