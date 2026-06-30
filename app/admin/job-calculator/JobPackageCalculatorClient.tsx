"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  buildCustomerBreakdownText,
  buildInternalCostText,
  calculatePackageTotals,
  money,
  numberFromAny,
  type PackageCalculatorLine,
  type PackagePhase,
} from "../../lib/pricing/jobPackageCalculator";

type ClientRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type CraneJobRow = {
  id: string;
  job_number: number | string | null;
  client_id: string | null;
  site_name: string | null;
  site_address: string | null;
  job_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
};

type TransportJobRow = {
  id: string;
  transport_number: string | null;
  client_id: string | null;
  job_type: string | null;
  collection_address: string | null;
  delivery_address: string | null;
  transport_date: string | null;
  delivery_date: string | null;
  status: string | null;
};

type QuoteRow = {
  id: string;
  client_id: string | null;
  subject: string | null;
  quote_date: string | null;
  status: string | null;
  amount: number | null;
};

type Props = {
  clients: ClientRow[];
  craneJobs: CraneJobRow[];
  transportJobs: TransportJobRow[];
  quotes: QuoteRow[];
  loadError?: string;
};

type SaveTarget = "none" | "crane_job" | "transport_job" | "quote" | "new_quote";

type EquipmentLine = {
  id: string;
  item: string;
  qty: string;
  rate: string;
  quote: boolean;
};

const todayIso = new Date().toISOString().slice(0, 10);

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fmtDate(value: string | null | undefined) {
  const raw = String(value ?? "").slice(0, 10);
  if (!raw) return "—";
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB");
}

function customerLabel(client: ClientRow | null | undefined) {
  if (!client) return "No customer selected";
  return [client.company_name, client.contact_name].filter(Boolean).join(" — ");
}

function addMoneyLine(lines: PackageCalculatorLine[], input: {
  id: string;
  item: string;
  description?: string;
  quantity?: string | number;
  rate?: string | number;
  amount?: string | number;
  show_on_quote?: boolean;
}) {
  const qty = numberFromAny(input.quantity || 1) || 1;
  const rate = numberFromAny(input.rate);
  const amount = numberFromAny(input.amount) || Math.round(qty * rate * 100) / 100;
  if (!clean(input.item) || amount === 0) return;

  lines.push({
    id: input.id,
    phase_id: "main",
    line_type: "sell",
    item: input.item,
    description: input.description || input.item,
    quantity: input.quantity ?? 1,
    rate: input.rate ?? amount,
    amount,
    pricing_mode: "qty_rate",
    show_on_quote: input.show_on_quote !== false,
  });
}

export default function JobPackageCalculatorClient({
  clients,
  craneJobs,
  transportJobs,
  quotes,
  loadError,
}: Props) {
  const [packageTitle, setPackageTitle] = useState("Simple job price");
  const [customerId, setCustomerId] = useState(clients[0]?.id ?? "");
  const [jobDate, setJobDate] = useState(todayIso);
  const [yardPostcode, setYardPostcode] = useState("SA10 6JY");
  const [collectionPostcode, setCollectionPostcode] = useState("");
  const [deliveryPostcode, setDeliveryPostcode] = useState("");
  const [returnToYard, setReturnToYard] = useState(true);
  const [chargeableMiles, setChargeableMiles] = useState("");
  const [ratePerMile, setRatePerMile] = useState("");
  const [transportBaseRate, setTransportBaseRate] = useState("");
  const [transportDescription, setTransportDescription] = useState("Transport charge");

  const [craneDescription, setCraneDescription] = useState("Crane hire");
  const [craneQty, setCraneQty] = useState("");
  const [craneRate, setCraneRate] = useState("");

  const [menQty, setMenQty] = useState("");
  const [menDays, setMenDays] = useState("1");
  const [manRate, setManRate] = useState("");
  const [menDescription, setMenDescription] = useState("Site team / labour");

  const [equipmentLines, setEquipmentLines] = useState<EquipmentLine[]>([
    { id: "lifting-beam", item: "Lifting beam", qty: "", rate: "", quote: true },
    { id: "crane-mats", item: "Crane mats", qty: "", rate: "", quote: true },
    { id: "escort", item: "Escort", qty: "", rate: "", quote: true },
    { id: "tracked-carrier", item: "Tracked carrier", qty: "", rate: "", quote: true },
  ]);

  const [manualAdjustment, setManualAdjustment] = useState("");
  const [manualAdjustmentLabel, setManualAdjustmentLabel] = useState("Manual adjustment / rounding");
  const [supplierCost, setSupplierCost] = useState("");
  const [scope, setScope] = useState("Crane / transport / lifting works as priced below.");
  const [notes, setNotes] = useState("Price is subject to clear access, suitable ground conditions, normal working hours unless stated, and no change in scope.");
  const [paymentTerms, setPaymentTerms] = useState("30 days from Month End");

  const [target, setTarget] = useState<SaveTarget>("none");
  const [targetId, setTargetId] = useState("");
  const [quoteStatus, setQuoteStatus] = useState<"Draft" | "Sent">("Draft");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; href?: string } | null>(null);
  const [showInternal, setShowInternal] = useState(true);

  const customerMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const selectedCustomer = customerMap.get(customerId) ?? null;

  const phases = useMemo<PackagePhase[]>(() => [
    {
      id: "main",
      title: "Job price",
      job_kind: "mixed",
      from_location: collectionPostcode,
      to_location: deliveryPostcode,
      work_date: jobDate,
      loads: 1,
      notes: [
        yardPostcode ? `Yard: ${yardPostcode}` : "",
        collectionPostcode ? `Collection: ${collectionPostcode}` : "",
        deliveryPostcode ? `Delivery/site: ${deliveryPostcode}` : "",
        returnToYard ? "Return to yard included" : "One-way / no return to yard selected",
      ].filter(Boolean).join(" | "),
    },
  ], [yardPostcode, collectionPostcode, deliveryPostcode, returnToYard, jobDate]);

  const lines = useMemo<PackageCalculatorLine[]>(() => {
    const output: PackageCalculatorLine[] = [];
    const miles = numberFromAny(chargeableMiles);
    const mileRate = numberFromAny(ratePerMile);
    const routeText = [
      yardPostcode ? `Yard ${yardPostcode}` : "",
      collectionPostcode ? `collection ${collectionPostcode}` : "",
      deliveryPostcode ? `delivery/site ${deliveryPostcode}` : "",
      returnToYard && yardPostcode ? `return ${yardPostcode}` : "",
    ].filter(Boolean).join(" → ");

    addMoneyLine(output, {
      id: "transport-base",
      item: transportDescription || "Transport charge",
      description: routeText || transportDescription || "Transport charge",
      quantity: 1,
      rate: transportBaseRate,
      amount: transportBaseRate,
      show_on_quote: true,
    });

    addMoneyLine(output, {
      id: "transport-mileage",
      item: "Mileage",
      description: `${miles || 0} miles × ${money(mileRate)} per mile${routeText ? ` | ${routeText}` : ""}`,
      quantity: chargeableMiles,
      rate: ratePerMile,
      show_on_quote: true,
    });

    addMoneyLine(output, {
      id: "crane-hire",
      item: craneDescription || "Crane hire",
      description: craneDescription || "Crane hire",
      quantity: craneQty,
      rate: craneRate,
      show_on_quote: true,
    });

    const men = numberFromAny(menQty);
    const days = numberFromAny(menDays) || 1;
    const labourRate = numberFromAny(manRate);
    if (men > 0 && labourRate > 0) {
      output.push({
        id: "site-team",
        phase_id: "main",
        line_type: "sell",
        item: menDescription || "Site team / labour",
        description: `${men} men × ${days} day(s) × ${money(labourRate)}`,
        quantity: men * days,
        rate: labourRate,
        amount: Math.round(men * days * labourRate * 100) / 100,
        pricing_mode: "qty_rate",
        show_on_quote: true,
      });
    }

    equipmentLines.forEach((line) => {
      addMoneyLine(output, {
        id: line.id,
        item: line.item,
        description: line.item,
        quantity: line.qty,
        rate: line.rate,
        show_on_quote: line.quote,
      });
    });

    addMoneyLine(output, {
      id: "manual-adjustment",
      item: manualAdjustmentLabel || "Manual adjustment",
      description: manualAdjustmentLabel || "Manual adjustment",
      quantity: 1,
      rate: manualAdjustment,
      amount: manualAdjustment,
      show_on_quote: false,
    });

    const cost = numberFromAny(supplierCost);
    if (cost > 0) {
      output.push({
        id: "supplier-cost",
        phase_id: "main",
        line_type: "cost",
        item: "Supplier / internal cost",
        description: "Supplier / internal cost for margin only",
        quantity: 1,
        rate: cost,
        amount: cost,
        pricing_mode: "fixed",
        show_on_quote: false,
      });
    }

    return output;
  }, [
    yardPostcode,
    collectionPostcode,
    deliveryPostcode,
    returnToYard,
    chargeableMiles,
    ratePerMile,
    transportBaseRate,
    transportDescription,
    craneDescription,
    craneQty,
    craneRate,
    menQty,
    menDays,
    manRate,
    menDescription,
    equipmentLines,
    manualAdjustment,
    manualAdjustmentLabel,
    supplierCost,
  ]);

  const totals = useMemo(() => calculatePackageTotals(lines), [lines]);
  const visibleBreakdown = useMemo(() => buildCustomerBreakdownText(lines, phases), [lines, phases]);
  const internalCostText = useMemo(() => buildInternalCostText(lines, phases), [lines, phases]);

  const filteredCraneJobs = useMemo(
    () => (customerId ? craneJobs.filter((job) => job.client_id === customerId) : craneJobs),
    [customerId, craneJobs]
  );

  const filteredTransportJobs = useMemo(
    () => (customerId ? transportJobs.filter((job) => job.client_id === customerId) : transportJobs),
    [customerId, transportJobs]
  );

  const filteredQuotes = useMemo(
    () => (customerId ? quotes.filter((quote) => quote.client_id === customerId) : quotes),
    [customerId, quotes]
  );

  const warnings = useMemo(() => {
    const list: string[] = [];
    if (totals.sellSubtotal <= 0) list.push("No customer sell price entered yet.");
    if (numberFromAny(chargeableMiles) > 0 && numberFromAny(ratePerMile) === 0) list.push("Miles entered but rate per mile is blank.");
    if (numberFromAny(ratePerMile) > 0 && numberFromAny(chargeableMiles) === 0) list.push("Rate per mile entered but chargeable miles is blank.");
    if (totals.grossProfit < 0) list.push("This price is showing a loss.");
    if (totals.sellSubtotal > 0 && totals.marginPercent < 20) list.push("Margin is under 20%. Check before issuing.");
    if ((target === "crane_job" || target === "transport_job" || target === "quote") && !targetId) list.push("Select a target record before applying the calculator.");
    if ((target === "new_quote" || target === "quote") && !customerId) list.push("Select a customer before saving to a quote.");
    return list;
  }, [totals, chargeableMiles, ratePerMile, target, targetId, customerId]);

  function setTargetType(nextTarget: SaveTarget) {
    setTarget(nextTarget);
    setTargetId("");
    setMessage(null);
  }

  function targetOptions() {
    if (target === "crane_job") {
      return filteredCraneJobs.map((job) => ({
        id: job.id,
        label: `Crane #${job.job_number ?? "—"} — ${job.site_name || job.site_address || "No site"} — ${fmtDate(job.start_date || job.job_date)}`,
      }));
    }

    if (target === "transport_job") {
      return filteredTransportJobs.map((job) => ({
        id: job.id,
        label: `${job.transport_number ?? "Transport"} — ${job.job_type || "Transport"} — ${job.collection_address || "Collection"} → ${job.delivery_address || "Delivery"} — ${fmtDate(job.transport_date)}`,
      }));
    }

    if (target === "quote") {
      return filteredQuotes.map((quote) => ({
        id: quote.id,
        label: `${quote.subject || "Quote"} — ${fmtDate(quote.quote_date)} — ${quote.status || "Draft"} — ${money(quote.amount)}`,
      }));
    }

    return [];
  }

  function syncCustomerFromTarget(nextTargetId: string) {
    if (!nextTargetId) return;
    if (target === "crane_job") {
      const job = craneJobs.find((row) => row.id === nextTargetId);
      if (job?.client_id) setCustomerId(job.client_id);
      if (job?.site_address) setDeliveryPostcode(job.site_address);
    }
    if (target === "transport_job") {
      const job = transportJobs.find((row) => row.id === nextTargetId);
      if (job?.client_id) setCustomerId(job.client_id);
      if (job?.collection_address) setCollectionPostcode(job.collection_address);
      if (job?.delivery_address) setDeliveryPostcode(job.delivery_address);
    }
    if (target === "quote") {
      const quote = quotes.find((row) => row.id === nextTargetId);
      if (quote?.client_id) setCustomerId(quote.client_id);
    }
  }

  async function copyText(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ tone: "ok", text: successText });
    } catch {
      setMessage({ tone: "error", text: "Could not copy. Highlight the text and copy it manually." });
    }
  }

  function buildQuoteText() {
    const route = [
      yardPostcode ? `Yard: ${yardPostcode}` : "",
      collectionPostcode ? `Collection: ${collectionPostcode}` : "",
      deliveryPostcode ? `Delivery/site: ${deliveryPostcode}` : "",
      returnToYard ? "Return to yard: Yes" : "Return to yard: No",
      chargeableMiles ? `Chargeable miles: ${chargeableMiles}` : "",
    ].filter(Boolean).join("\n");

    return [
      `COST SUMMARY:\n${money(totals.sellSubtotal)} + VAT`,
      route ? `ROUTE / SITE:\n${route}` : "",
      `BREAKDOWN:\n${visibleBreakdown || "No customer lines entered."}`,
      scope ? `SCOPE OF WORK:\n${scope}` : "",
      notes ? `ADDITIONAL NOTES:\n${notes}` : "",
      `PAYMENT TERMS:\n${paymentTerms}`,
    ].filter(Boolean).join("\n\n");
  }

  function updateEquipment(id: string, patch: Partial<EquipmentLine>) {
    setEquipmentLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addEquipmentLine() {
    setEquipmentLines((current) => [...current, { id: makeId("equipment"), item: "", qty: "", rate: "", quote: true }]);
  }

  function removeEquipmentLine(id: string) {
    setEquipmentLines((current) => current.filter((line) => line.id !== id));
  }

  function resetCalculator() {
    setPackageTitle("Simple job price");
    setJobDate(todayIso);
    setYardPostcode("SA10 6JY");
    setCollectionPostcode("");
    setDeliveryPostcode("");
    setReturnToYard(true);
    setChargeableMiles("");
    setRatePerMile("");
    setTransportBaseRate("");
    setTransportDescription("Transport charge");
    setCraneDescription("Crane hire");
    setCraneQty("");
    setCraneRate("");
    setMenQty("");
    setMenDays("1");
    setManRate("");
    setMenDescription("Site team / labour");
    setEquipmentLines([
      { id: "lifting-beam", item: "Lifting beam", qty: "", rate: "", quote: true },
      { id: "crane-mats", item: "Crane mats", qty: "", rate: "", quote: true },
      { id: "escort", item: "Escort", qty: "", rate: "", quote: true },
      { id: "tracked-carrier", item: "Tracked carrier", qty: "", rate: "", quote: true },
    ]);
    setManualAdjustment("");
    setSupplierCost("");
    setMessage(null);
  }

  async function applyCalculator() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/job-calculator/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_title: packageTitle,
          client_id: customerId || null,
          site_location: [collectionPostcode, deliveryPostcode].filter(Boolean).join(" → "),
          scope,
          notes,
          payment_terms: paymentTerms,
          phases,
          lines,
          target_type: target,
          target_id: targetId || null,
          quote_status: quoteStatus,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage({ tone: "error", text: data?.error || "Could not apply calculator." });
        return;
      }

      setMessage({ tone: "ok", text: data?.message || "Calculator applied.", href: data?.href });
      if (data?.id && target === "new_quote") {
        setTarget("quote");
        setTargetId(data.id);
      }
    } catch (error: any) {
      setMessage({ tone: "error", text: error?.message || "Could not apply calculator." });
    } finally {
      setSaving(false);
    }
  }

  const currentTargetOptions = targetOptions();

  return (
    <div style={pageWrap}>
      <div style={headerCard}>
        <div>
          <div style={eyebrow}>Master admin only</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 32 }}>Simple Job Calculator</h1>
          <p style={{ margin: "8px 0 0", opacity: 0.78 }}>
            Postcodes, mileage, crane rate, men, lifting equipment, supplier cost and margin. Nothing is saved until you choose a target and press apply.
          </p>
        </div>
        <div style={totalPill}>
          <div style={{ opacity: 0.72, fontSize: 12 }}>Sell total</div>
          <div style={{ fontSize: 28, fontWeight: 1000 }}>{money(totals.sellSubtotal)}</div>
          <div style={{ opacity: 0.72, fontSize: 12 }}>VAT {money(totals.vat)} | Total {money(totals.invoiceTotal)}</div>
        </div>
      </div>

      {loadError ? <div style={errorBox}>{loadError}</div> : null}
      {message ? (
        <div style={message.tone === "ok" ? successBox : errorBox}>
          {message.text} {message.href ? <a href={message.href} style={{ fontWeight: 900 }}>Open record</a> : null}
        </div>
      ) : null}

      <div style={layoutGrid}>
        <main style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <section style={cardStyle}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Job details</h2>
                <p style={sectionSub}>Keep this simple. Select customer and enter the basic route/site details.</p>
              </div>
              <button type="button" style={secondaryBtn} onClick={resetCalculator}>Clear calculator</button>
            </div>
            <div style={formGrid}>
              <label style={fieldStyle}>Title
                <input style={inputStyle} value={packageTitle} onChange={(e) => setPackageTitle(e.target.value)} />
              </label>
              <label style={fieldStyle}>Customer
                <select style={inputStyle} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Select customer</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{customerLabel(client)}</option>)}
                </select>
              </label>
              <label style={fieldStyle}>Date
                <input style={inputStyle} type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} />
              </label>
              <label style={fieldStyle}>Payment terms
                <input style={inputStyle} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </label>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>Postcodes / mileage</h2>
            <p style={sectionSub}>Enter the postcodes and the chargeable mileage. The price is miles × rate per mile, plus any base transport rate.</p>
            <div style={formGrid}>
              <label style={fieldStyle}>Yard postcode
                <input style={inputStyle} value={yardPostcode} onChange={(e) => setYardPostcode(e.target.value)} placeholder="SA10 6JY" />
              </label>
              <label style={fieldStyle}>Collection postcode / address
                <input style={inputStyle} value={collectionPostcode} onChange={(e) => setCollectionPostcode(e.target.value)} placeholder="e.g. SA14..." />
              </label>
              <label style={fieldStyle}>Delivery / site postcode
                <input style={inputStyle} value={deliveryPostcode} onChange={(e) => setDeliveryPostcode(e.target.value)} placeholder="e.g. NP4..." />
              </label>
              <label style={checkField}>
                <input type="checkbox" checked={returnToYard} onChange={(e) => setReturnToYard(e.target.checked)} />
                Return to yard included
              </label>
              <label style={fieldStyle}>Chargeable miles
                <input style={inputStyle} inputMode="decimal" value={chargeableMiles} onChange={(e) => setChargeableMiles(e.target.value)} placeholder="Enter miles" />
              </label>
              <label style={fieldStyle}>Rate per mile
                <input style={inputStyle} inputMode="decimal" value={ratePerMile} onChange={(e) => setRatePerMile(e.target.value)} placeholder="e.g. 1.10 or 4.50" />
              </label>
              <label style={fieldStyle}>Base transport rate
                <input style={inputStyle} inputMode="decimal" value={transportBaseRate} onChange={(e) => setTransportBaseRate(e.target.value)} placeholder="Optional" />
              </label>
              <label style={fieldStyle}>Transport description
                <input style={inputStyle} value={transportDescription} onChange={(e) => setTransportDescription(e.target.value)} />
              </label>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>Crane and men</h2>
            <div style={formGrid}>
              <label style={fieldStyle}>Crane description
                <input style={inputStyle} value={craneDescription} onChange={(e) => setCraneDescription(e.target.value)} placeholder="e.g. Böcker AK46 / HK40 / Contract lift crane" />
              </label>
              <label style={fieldStyle}>Crane qty / visits
                <input style={inputStyle} inputMode="decimal" value={craneQty} onChange={(e) => setCraneQty(e.target.value)} placeholder="e.g. 1" />
              </label>
              <label style={fieldStyle}>Crane rate
                <input style={inputStyle} inputMode="decimal" value={craneRate} onChange={(e) => setCraneRate(e.target.value)} placeholder="e.g. 1300" />
              </label>
              <label style={fieldStyle}>Men description
                <input style={inputStyle} value={menDescription} onChange={(e) => setMenDescription(e.target.value)} />
              </label>
              <label style={fieldStyle}>Number of men
                <input style={inputStyle} inputMode="decimal" value={menQty} onChange={(e) => setMenQty(e.target.value)} placeholder="e.g. 3" />
              </label>
              <label style={fieldStyle}>Days / visits
                <input style={inputStyle} inputMode="decimal" value={menDays} onChange={(e) => setMenDays(e.target.value)} />
              </label>
              <label style={fieldStyle}>Rate per man
                <input style={inputStyle} inputMode="decimal" value={manRate} onChange={(e) => setManRate(e.target.value)} placeholder="e.g. 450" />
              </label>
            </div>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Lifting equipment / extras</h2>
                <p style={sectionSub}>Add lifting beams, mats, escorts, tracked carrier or any other extra. Blank qty/rate means it is not included.</p>
              </div>
              <button type="button" style={primaryBtn} onClick={addEquipmentLine}>+ Add extra</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {equipmentLines.map((line) => (
                <div key={line.id} style={equipmentGrid}>
                  <input style={inputStyle} value={line.item} onChange={(e) => updateEquipment(line.id, { item: e.target.value })} placeholder="Item" />
                  <input style={inputStyle} inputMode="decimal" value={line.qty} onChange={(e) => updateEquipment(line.id, { qty: e.target.value })} placeholder="Qty" />
                  <input style={inputStyle} inputMode="decimal" value={line.rate} onChange={(e) => updateEquipment(line.id, { rate: e.target.value })} placeholder="Rate" />
                  <label style={smallCheck}><input type="checkbox" checked={line.quote} onChange={(e) => updateEquipment(line.id, { quote: e.target.checked })} /> Quote</label>
                  <button type="button" style={dangerGhostBtn} onClick={() => removeEquipmentLine(line.id)}>Remove</button>
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>Costs / notes</h2>
            <div style={formGrid}>
              <label style={fieldStyle}>Supplier / internal cost
                <input style={inputStyle} inputMode="decimal" value={supplierCost} onChange={(e) => setSupplierCost(e.target.value)} placeholder="Hidden cost for margin only" />
              </label>
              <label style={fieldStyle}>Manual adjustment
                <input style={inputStyle} inputMode="decimal" value={manualAdjustment} onChange={(e) => setManualAdjustment(e.target.value)} placeholder="Optional uplift / rounding" />
              </label>
              <label style={fieldStyle}>Adjustment label
                <input style={inputStyle} value={manualAdjustmentLabel} onChange={(e) => setManualAdjustmentLabel(e.target.value)} />
              </label>
            </div>
            <label style={{ ...fieldStyle, marginTop: 12 }}>Scope of work
              <textarea style={textareaStyle} value={scope} onChange={(e) => setScope(e.target.value)} />
            </label>
            <label style={{ ...fieldStyle, marginTop: 12 }}>Additional notes / conditions
              <textarea style={textareaStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </section>
        </main>

        <aside style={sideColumn}>
          <section style={cardStyle}>
            <h2 style={sectionTitle}>Apply / save</h2>
            <p style={sectionSub}>Master admin only. Nothing writes to the system until you press Apply.</p>
            <label style={fieldStyle}>Save target
              <select style={inputStyle} value={target} onChange={(e) => setTargetType(e.target.value as SaveTarget)}>
                <option value="none">Do not save yet</option>
                <option value="crane_job">Apply to crane job</option>
                <option value="transport_job">Apply to transport job</option>
                <option value="quote">Update existing quote</option>
                <option value="new_quote">Create new quote</option>
              </select>
            </label>

            {target === "new_quote" ? (
              <label style={{ ...fieldStyle, marginTop: 10 }}>Quote status
                <select style={inputStyle} value={quoteStatus} onChange={(e) => setQuoteStatus(e.target.value as "Draft" | "Sent")}> 
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                </select>
              </label>
            ) : null}

            {target !== "none" && target !== "new_quote" ? (
              <label style={{ ...fieldStyle, marginTop: 10 }}>Target record
                <select
                  style={inputStyle}
                  value={targetId}
                  onChange={(e) => {
                    setTargetId(e.target.value);
                    syncCustomerFromTarget(e.target.value);
                  }}
                >
                  <option value="">Select record</option>
                  {currentTargetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
            ) : null}

            <button
              type="button"
              style={{ ...primaryBtn, width: "100%", marginTop: 14, opacity: saving || target === "none" ? 0.65 : 1 }}
              disabled={saving || target === "none"}
              onClick={applyCalculator}
            >
              {saving ? "Saving..." : target === "none" ? "Choose save target" : "Apply calculator"}
            </button>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>Totals</h2>
            <div style={totalRows}>
              <TotalRow label="Sell subtotal" value={money(totals.sellSubtotal)} strong />
              <TotalRow label="VAT @ 20%" value={money(totals.vat)} />
              <TotalRow label="Invoice total" value={money(totals.invoiceTotal)} strong />
              <TotalRow label="Cost total" value={money(totals.costSubtotal)} />
              <TotalRow label="Gross profit" value={money(totals.grossProfit)} strong />
              <TotalRow label="Margin" value={`${totals.marginPercent.toFixed(1)}%`} strong />
            </div>
            <label style={toggleRow}>
              <input type="checkbox" checked={showInternal} onChange={(e) => setShowInternal(e.target.checked)} />
              Show internal costs
            </label>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitle}>Warnings</h2>
            {warnings.length === 0 ? <div style={okSmall}>No pricing warnings.</div> : (
              <div style={{ display: "grid", gap: 8 }}>{warnings.map((warning) => <div key={warning} style={warnBox}>{warning}</div>)}</div>
            )}
          </section>

          <section style={cardStyle}>
            <div style={sectionHeaderSmall}>
              <h2 style={sectionTitle}>Customer breakdown</h2>
              <button type="button" style={secondaryBtnSmall} onClick={() => copyText(buildQuoteText(), "Quote text copied.")}>Copy</button>
            </div>
            <pre style={preBox}>{buildQuoteText()}</pre>
          </section>

          {showInternal ? (
            <section style={cardStyle}>
              <div style={sectionHeaderSmall}>
                <h2 style={sectionTitle}>Internal costs</h2>
                <button type="button" style={secondaryBtnSmall} onClick={() => copyText(internalCostText, "Internal cost breakdown copied.")}>Copy</button>
              </div>
              <pre style={preBox}>{internalCostText || "No internal costs entered yet."}</pre>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={totalRow}>
      <span>{label}</span>
      <strong style={{ fontSize: strong ? 18 : 15 }}>{value}</strong>
    </div>
  );
}

const pageWrap: CSSProperties = {
  width: "min(1680px, 100%)",
  margin: "0 auto",
  padding: "0 0 40px",
};

const headerCard: CSSProperties = {
  marginTop: 16,
  padding: 18,
  borderRadius: 16,
  background: "rgba(255,255,255,0.22)",
  border: "1px solid rgba(255,255,255,0.42)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "center",
};

const layoutGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 390px",
  gap: 16,
  alignItems: "start",
  marginTop: 16,
};

const cardStyle: CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
};

const sideColumn: CSSProperties = {
  display: "grid",
  gap: 16,
  position: "sticky",
  top: 12,
};

const eyebrow: CSSProperties = {
  display: "inline-flex",
  padding: "5px 9px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.08)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.3,
  textTransform: "uppercase",
};

const totalPill: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  minWidth: 250,
};

const sectionHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionHeaderSmall: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 1000,
};

const sectionSub: CSSProperties = {
  margin: "5px 0 12px",
  opacity: 0.72,
};

const formGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
  fontSize: 13,
};

const checkField: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontWeight: 800,
  fontSize: 13,
  paddingTop: 24,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.16)",
  background: "rgba(255,255,255,0.95)",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 82,
  resize: "vertical",
  fontFamily: "inherit",
};

const equipmentGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) 90px 120px 90px 90px",
  gap: 8,
  alignItems: "center",
};

const primaryBtn: CSSProperties = {
  padding: "10px 13px",
  borderRadius: 10,
  border: "none",
  background: "#111827",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  padding: "10px 13px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.88)",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtnSmall: CSSProperties = {
  ...secondaryBtn,
  padding: "7px 10px",
  fontSize: 12,
};

const dangerGhostBtn: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 9,
  border: "1px solid rgba(220,38,38,0.25)",
  background: "rgba(255,255,255,0.75)",
  color: "#b91c1c",
  fontWeight: 900,
  cursor: "pointer",
};

const smallCheck: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontWeight: 800,
  fontSize: 13,
};

const totalRows: CSSProperties = {
  display: "grid",
  gap: 9,
  marginTop: 10,
};

const totalRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  paddingBottom: 8,
};

const toggleRow: CSSProperties = {
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 800,
};

const preBox: CSSProperties = {
  whiteSpace: "pre-wrap",
  background: "rgba(17,24,39,0.06)",
  border: "1px solid rgba(17,24,39,0.08)",
  padding: 12,
  borderRadius: 12,
  margin: 0,
  minHeight: 80,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
};

const warnBox: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(245,158,11,0.16)",
  border: "1px solid rgba(245,158,11,0.35)",
  fontWeight: 800,
};

const okSmall: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(34,197,94,0.14)",
  border: "1px solid rgba(34,197,94,0.24)",
  fontWeight: 800,
};

const successBox: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(34,197,94,0.14)",
  border: "1px solid rgba(34,197,94,0.28)",
  fontWeight: 850,
};

const errorBox: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(239,68,68,0.14)",
  border: "1px solid rgba(239,68,68,0.28)",
  fontWeight: 850,
};
