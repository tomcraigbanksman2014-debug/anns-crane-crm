"use client";

import { useMemo, useState } from "react";
import {
  buildCustomerBreakdownText,
  buildInternalCostText,
  calculatePackageLineAmount,
  calculatePackageTotals,
  money,
  numberFromAny,
  type PackageCalculatorLine,
  type PackagePhase,
  type PackagePricingMode,
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

const todayIso = new Date().toISOString().slice(0, 10);

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

const defaultPhases: PackagePhase[] = [
  {
    id: "phase-1",
    title: "Phase 1",
    job_kind: "transport",
    from_location: "",
    to_location: "",
    work_date: todayIso,
    loads: 1,
    notes: "",
  },
  {
    id: "phase-2",
    title: "Phase 2",
    job_kind: "mixed",
    from_location: "",
    to_location: "",
    work_date: todayIso,
    loads: 1,
    notes: "",
  },
];

const defaultLines: PackageCalculatorLine[] = [
  {
    id: "line-transport-1",
    phase_id: "phase-1",
    line_type: "sell",
    item: "Transport load / HIAB / trailer",
    description: "Customer transport charge for phase 1",
    quantity: 1,
    rate: 1400,
    amount: 1400,
    pricing_mode: "qty_rate",
    show_on_quote: true,
  },
  {
    id: "line-transport-cost-1",
    phase_id: "phase-1",
    line_type: "cost",
    item: "Supplier / internal transport cost",
    description: "Hidden cost for margin only",
    quantity: 1,
    rate: 0,
    amount: 0,
    pricing_mode: "fixed",
    show_on_quote: false,
  },
  {
    id: "line-lifting-beam",
    phase_id: "phase-2",
    line_type: "sell",
    item: "Lifting beam",
    description: "Lifting beam supplied for package works",
    quantity: 1,
    rate: 1500,
    amount: 1500,
    pricing_mode: "qty_rate",
    show_on_quote: true,
  },
  {
    id: "line-escort",
    phase_id: "phase-2",
    line_type: "sell",
    item: "Escort",
    description: "Escort vehicle / escort provision",
    quantity: 2,
    rate: 800,
    amount: 1600,
    pricing_mode: "qty_rate",
    show_on_quote: true,
  },
  {
    id: "line-tracked-carrier",
    phase_id: "phase-2",
    line_type: "sell",
    item: "Tracked carrier",
    description: "Tracked carrier for site movement/support",
    quantity: 1,
    rate: 500,
    amount: 500,
    pricing_mode: "qty_rate",
    show_on_quote: true,
  },
  {
    id: "line-site-team",
    phase_id: "phase-2",
    line_type: "sell",
    item: "Site team",
    description: "Site team / lifting team allowance",
    quantity: 3,
    rate: 450,
    amount: 1350,
    pricing_mode: "qty_rate",
    show_on_quote: true,
  },
  {
    id: "line-mileage",
    phase_id: "phase-2",
    line_type: "sell",
    item: "Mileage + 5%",
    description: "Mileage from Swansea with uplift included",
    quantity: 0,
    rate: 1.1,
    amount: 0,
    pricing_mode: "qty_rate",
    show_on_quote: false,
    notes: "Put the chargeable miles in quantity. Add 5% manually or use manual adjustment line if needed.",
  },
  {
    id: "line-o2-crane",
    phase_id: "phase-2",
    line_type: "sell",
    item: "Site crane / contract lift crane",
    description: "Crane at destination/site",
    quantity: 1,
    rate: 1300,
    amount: 1300,
    pricing_mode: "qty_rate",
    show_on_quote: true,
  },
  {
    id: "line-o2-team",
    phase_id: "phase-2",
    line_type: "sell",
    item: "Lifting team + 20%",
    description: "Destination/site lifting team including uplift",
    quantity: 1,
    rate: 1020,
    amount: 1020,
    pricing_mode: "qty_rate",
    show_on_quote: true,
  },
  {
    id: "line-mats",
    phase_id: "phase-2",
    line_type: "sell",
    item: "Crane mats",
    description: "Crane mats supplied to site",
    quantity: 1,
    rate: 500,
    amount: 500,
    pricing_mode: "qty_rate",
    show_on_quote: true,
  },
  {
    id: "line-commercial-adjustment",
    phase_id: null,
    line_type: "sell",
    item: "Manual commercial adjustment",
    description: "Commercial rounding / uplift. Hide from quote if you want it merged into the overall package total.",
    quantity: 1,
    rate: 0,
    amount: 0,
    pricing_mode: "fixed",
    show_on_quote: false,
  },
];

const presetLines: Array<{
  label: string;
  line: Omit<PackageCalculatorLine, "id">;
}> = [
  {
    label: "HIAB + trailer £1,400",
    line: {
      phase_id: "phase-1",
      line_type: "sell",
      item: "HIAB with 40ft trailer",
      description: "HIAB with 40ft trailer",
      quantity: 1,
      rate: 1400,
      pricing_mode: "qty_rate",
      show_on_quote: true,
    },
  },
  {
    label: "Standard unit £1,100",
    line: {
      phase_id: "phase-1",
      line_type: "sell",
      item: "Standard unit with 40ft trailer",
      description: "Standard unit with 40ft trailer",
      quantity: 1,
      rate: 1100,
      pricing_mode: "qty_rate",
      show_on_quote: true,
    },
  },
  {
    label: "Escort £800",
    line: {
      phase_id: "phase-1",
      line_type: "sell",
      item: "Escort",
      description: "Escort vehicle / escort provision",
      quantity: 1,
      rate: 800,
      pricing_mode: "qty_rate",
      show_on_quote: true,
    },
  },
  {
    label: "Lifting beam £1,500",
    line: {
      phase_id: "phase-1",
      line_type: "sell",
      item: "Lifting beam",
      description: "Lifting beam supplied",
      quantity: 1,
      rate: 1500,
      pricing_mode: "qty_rate",
      show_on_quote: true,
    },
  },
  {
    label: "Team £450 each",
    line: {
      phase_id: "phase-1",
      line_type: "sell",
      item: "Site team",
      description: "Site team / labour support",
      quantity: 1,
      rate: 450,
      pricing_mode: "qty_rate",
      show_on_quote: true,
    },
  },
  {
    label: "Crane mats £500",
    line: {
      phase_id: "phase-1",
      line_type: "sell",
      item: "Crane mats",
      description: "Crane mats supplied",
      quantity: 1,
      rate: 500,
      pricing_mode: "qty_rate",
      show_on_quote: true,
    },
  },
  {
    label: "Hidden cost/uplift",
    line: {
      phase_id: "phase-1",
      line_type: "sell",
      item: "Cost + uplift item",
      description: "Sell line calculated from hidden cost plus uplift",
      quantity: 1,
      rate: 0,
      cost_amount: 1000,
      uplift_percent: 20,
      pricing_mode: "cost_uplift",
      show_on_quote: true,
    },
  },
  {
    label: "Supplier cost",
    line: {
      phase_id: "phase-1",
      line_type: "cost",
      item: "Supplier / subcontractor cost",
      description: "Hidden supplier cost for margin",
      quantity: 1,
      rate: 0,
      amount: 0,
      pricing_mode: "fixed",
      show_on_quote: false,
    },
  },
];

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

export default function JobPackageCalculatorClient({
  clients,
  craneJobs,
  transportJobs,
  quotes,
  loadError,
}: Props) {
  const [packageTitle, setPackageTitle] = useState("Full package quote");
  const [customerId, setCustomerId] = useState(clients[0]?.id ?? "");
  const [siteLocation, setSiteLocation] = useState("");
  const [scope, setScope] = useState("Transport, lifting support, crane attendance and associated site equipment as priced below.");
  const [notes, setNotes] = useState("Price is subject to clear access, suitable ground conditions, normal working hours unless stated, and no change in scope.");
  const [paymentTerms, setPaymentTerms] = useState("30 days from Month End");
  const [phases, setPhases] = useState<PackagePhase[]>(defaultPhases);
  const [lines, setLines] = useState<PackageCalculatorLine[]>(defaultLines);
  const [target, setTarget] = useState<SaveTarget>("none");
  const [targetId, setTargetId] = useState("");
  const [quoteStatus, setQuoteStatus] = useState<"Draft" | "Sent">("Draft");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; href?: string } | null>(null);
  const [showInternal, setShowInternal] = useState(true);

  const customerMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const selectedCustomer = customerMap.get(customerId) ?? null;
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
    if (totals.sellSubtotal <= 0) list.push("No customer sell total has been entered yet.");
    if (totals.marginPercent > 0 && totals.marginPercent < 20) list.push("Margin is under 20%. Check the sell rate before issuing this.");
    if (totals.grossProfit < 0) list.push("This package is showing a loss.");
    if (lines.some((line) => clean(line.item).toLowerCase().includes("mileage") && numberFromAny(line.quantity) === 0)) {
      list.push("Mileage line exists but chargeable miles are still zero.");
    }
    if (lines.some((line) => line.pricing_mode === "cost_uplift" && numberFromAny(line.cost_amount) === 0)) {
      list.push("A cost + uplift line has no hidden cost entered.");
    }
    if (lines.some((line) => line.line_type === "cost" && calculatePackageLineAmount(line) === 0)) {
      list.push("A supplier/internal cost line is still zero. Delete it or enter the cost.");
    }
    if (!customerId && (target === "new_quote" || target === "quote")) list.push("Select a customer before saving to a quote.");
    if ((target === "crane_job" || target === "transport_job" || target === "quote") && !targetId) list.push("Select a target record before applying the calculator.");
    return list;
  }, [totals, lines, customerId, target, targetId]);

  function updatePhase(id: string, patch: Partial<PackagePhase>) {
    setPhases((current) => current.map((phase) => (phase.id === id ? { ...phase, ...patch } : phase)));
  }

  function addPhase() {
    const id = makeId("phase");
    setPhases((current) => [
      ...current,
      {
        id,
        title: `Phase ${current.length + 1}`,
        job_kind: "mixed",
        from_location: "",
        to_location: "",
        work_date: todayIso,
        loads: 1,
        notes: "",
      },
    ]);
  }

  function removePhase(id: string) {
    setPhases((current) => current.filter((phase) => phase.id !== id));
    setLines((current) => current.map((line) => (line.phase_id === id ? { ...line, phase_id: null } : line)));
  }

  function updateLine(id: string, patch: Partial<PackageCalculatorLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLine(base?: Partial<PackageCalculatorLine>) {
    const firstPhase = phases[0]?.id ?? null;
    setLines((current) => [
      ...current,
      {
        id: makeId("line"),
        phase_id: firstPhase,
        line_type: "sell",
        item: "",
        description: "",
        quantity: 1,
        rate: 0,
        amount: 0,
        cost_amount: 0,
        uplift_percent: 0,
        pricing_mode: "qty_rate",
        show_on_quote: true,
        notes: "",
        ...base,
      },
    ]);
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((line) => line.id !== id));
  }

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
      if (job?.site_name || job?.site_address) setSiteLocation(job.site_name || job.site_address || "");
    }
    if (target === "transport_job") {
      const job = transportJobs.find((row) => row.id === nextTargetId);
      if (job?.client_id) setCustomerId(job.client_id);
      if (job?.delivery_address || job?.collection_address) setSiteLocation(job.delivery_address || job.collection_address || "");
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
    return [
      `COST SUMMARY:\n${money(totals.sellSubtotal)} + VAT`,
      `BREAKDOWN:\n${visibleBreakdown || "No visible customer lines entered."}`,
      notes ? `ADDITIONAL NOTES:\n${notes}` : "",
      `PAYMENT TERMS:\n${paymentTerms}`,
    ]
      .filter(Boolean)
      .join("\n\n");
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
          site_location: siteLocation,
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
          <h1 style={{ margin: "4px 0 0", fontSize: 34 }}>Full Package Job Calculator</h1>
          <p style={{ margin: "8px 0 0", opacity: 0.78 }}>
            Build full crane, transport and mixed package prices with phases, hidden costs, uplift, margin checks and quote-ready breakdowns.
          </p>
        </div>
        <div style={totalPill}>
          <div style={{ opacity: 0.72, fontSize: 12 }}>Current sell total</div>
          <div style={{ fontSize: 28, fontWeight: 1000 }}>{money(totals.sellSubtotal)}</div>
          <div style={{ opacity: 0.72, fontSize: 12 }}>+ VAT {money(totals.vat)}</div>
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
                <h2 style={sectionTitle}>Package details</h2>
                <p style={sectionSub}>This is the customer-facing header and quote context.</p>
              </div>
              <button type="button" style={secondaryBtn} onClick={() => copyText(buildQuoteText(), "Quote text copied.")}>Copy quote text</button>
            </div>

            <div style={formGrid}>
              <label style={fieldStyle}>
                Package title
                <input style={inputStyle} value={packageTitle} onChange={(e) => setPackageTitle(e.target.value)} />
              </label>

              <label style={fieldStyle}>
                Customer
                <select style={inputStyle} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Select customer</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{customerLabel(client)}</option>
                  ))}
                </select>
              </label>

              <label style={fieldStyle}>
                Site / work location
                <input style={inputStyle} value={siteLocation} onChange={(e) => setSiteLocation(e.target.value)} placeholder="Site, destination or project location" />
              </label>

              <label style={fieldStyle}>
                Payment terms
                <input style={inputStyle} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </label>
            </div>

            <label style={{ ...fieldStyle, marginTop: 12 }}>
              Scope of work
              <textarea style={textareaStyle} value={scope} onChange={(e) => setScope(e.target.value)} />
            </label>

            <label style={{ ...fieldStyle, marginTop: 12 }}>
              Additional notes / conditions
              <textarea style={textareaStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Package phases</h2>
                <p style={sectionSub}>Split the price by visits, routes, lifts, escorts, site days or staged works.</p>
              </div>
              <button type="button" style={primaryBtn} onClick={addPhase}>+ Add phase</button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {phases.map((phase, index) => (
                <div key={phase.id} style={phaseCard}>
                  <div style={phaseTopRow}>
                    <strong>Phase {index + 1}</strong>
                    <button type="button" style={dangerGhostBtn} onClick={() => removePhase(phase.id)}>Remove</button>
                  </div>
                  <div style={phaseGrid}>
                    <input style={inputStyle} value={phase.title} onChange={(e) => updatePhase(phase.id, { title: e.target.value })} placeholder="Phase title" />
                    <select style={inputStyle} value={phase.job_kind} onChange={(e) => updatePhase(phase.id, { job_kind: e.target.value as PackagePhase["job_kind"] })}>
                      <option value="transport">Transport</option>
                      <option value="crane">Crane</option>
                      <option value="mixed">Mixed</option>
                    </select>
                    <input style={inputStyle} type="date" value={phase.work_date || ""} onChange={(e) => updatePhase(phase.id, { work_date: e.target.value })} />
                    <input style={inputStyle} value={phase.loads ?? ""} onChange={(e) => updatePhase(phase.id, { loads: e.target.value })} placeholder="Loads / visits" />
                    <input style={inputStyle} value={phase.from_location || ""} onChange={(e) => updatePhase(phase.id, { from_location: e.target.value })} placeholder="From / collection" />
                    <input style={inputStyle} value={phase.to_location || ""} onChange={(e) => updatePhase(phase.id, { to_location: e.target.value })} placeholder="To / delivery / site" />
                  </div>
                  <input style={{ ...inputStyle, marginTop: 8 }} value={phase.notes || ""} onChange={(e) => updatePhase(phase.id, { notes: e.target.value })} placeholder="Phase notes" />
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Commercial lines</h2>
                <p style={sectionSub}>Sell lines form the customer total. Cost lines and hidden cost fields are for margin only.</p>
              </div>
              <button type="button" style={primaryBtn} onClick={() => addLine()}>+ Add line</button>
            </div>

            <div style={presetWrap}>
              {presetLines.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  style={chipBtn}
                  onClick={() => addLine(preset.line)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Phase</th>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Mode</th>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Rate</th>
                    <th style={thStyle}>Manual amount</th>
                    <th style={thStyle}>Hidden cost</th>
                    <th style={thStyle}>Uplift %</th>
                    <th style={thStyle}>Quote</th>
                    <th style={thStyle}>Line total</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const amount = calculatePackageLineAmount(line);
                    return (
                      <tr key={line.id}>
                        <td style={tdStyle}>
                          <select style={smallInput} value={line.line_type} onChange={(e) => updateLine(line.id, { line_type: e.target.value as "sell" | "cost" })}>
                            <option value="sell">Sell</option>
                            <option value="cost">Cost</option>
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <select style={smallInput} value={line.phase_id || ""} onChange={(e) => updateLine(line.id, { phase_id: e.target.value || null })}>
                            <option value="">No phase</option>
                            {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.title}</option>)}
                          </select>
                        </td>
                        <td style={{ ...tdStyle, minWidth: 220 }}>
                          <input style={smallInput} value={line.item} onChange={(e) => updateLine(line.id, { item: e.target.value })} placeholder="Item" />
                          <input style={{ ...smallInput, marginTop: 6 }} value={line.description || ""} onChange={(e) => updateLine(line.id, { description: e.target.value })} placeholder="Description" />
                        </td>
                        <td style={tdStyle}>
                          <select style={smallInput} value={line.pricing_mode || "fixed"} onChange={(e) => updateLine(line.id, { pricing_mode: e.target.value as PackagePricingMode })}>
                            <option value="fixed">Fixed</option>
                            <option value="qty_rate">Qty × rate</option>
                            <option value="cost_uplift">Cost + uplift</option>
                          </select>
                        </td>
                        <td style={tdStyle}><input style={tinyInput} value={line.quantity ?? ""} onChange={(e) => updateLine(line.id, { quantity: e.target.value })} /></td>
                        <td style={tdStyle}><input style={tinyInput} value={line.rate ?? ""} onChange={(e) => updateLine(line.id, { rate: e.target.value })} /></td>
                        <td style={tdStyle}><input style={tinyInput} value={line.amount ?? ""} onChange={(e) => updateLine(line.id, { amount: e.target.value })} /></td>
                        <td style={tdStyle}><input style={tinyInput} value={line.cost_amount ?? ""} onChange={(e) => updateLine(line.id, { cost_amount: e.target.value })} /></td>
                        <td style={tdStyle}><input style={tinyInput} value={line.uplift_percent ?? ""} onChange={(e) => updateLine(line.id, { uplift_percent: e.target.value })} /></td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <input type="checkbox" checked={line.show_on_quote !== false} onChange={(e) => updateLine(line.id, { show_on_quote: e.target.checked })} />
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 900, whiteSpace: "nowrap" }}>{money(amount)}</td>
                        <td style={tdStyle}>
                          <button type="button" style={dangerGhostBtn} onClick={() => removeLine(line.id)}>Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside style={sideColumn}>
          <section style={cardStyle}>
            <h2 style={sectionTitle}>Apply / save</h2>
            <p style={sectionSub}>Locked to master admin. This writes into the existing commercial breakdown and totals.</p>

            <label style={fieldStyle}>
              Save target
              <select style={inputStyle} value={target} onChange={(e) => setTargetType(e.target.value as SaveTarget)}>
                <option value="none">Do not save yet</option>
                <option value="crane_job">Apply to crane job</option>
                <option value="transport_job">Apply to transport job</option>
                <option value="quote">Update existing quote</option>
                <option value="new_quote">Create new quote</option>
              </select>
            </label>

            {target === "new_quote" ? (
              <label style={{ ...fieldStyle, marginTop: 10 }}>
                Quote status
                <select style={inputStyle} value={quoteStatus} onChange={(e) => setQuoteStatus(e.target.value as "Draft" | "Sent")}>
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                </select>
              </label>
            ) : null}

            {target !== "none" && target !== "new_quote" ? (
              <label style={{ ...fieldStyle, marginTop: 10 }}>
                Target record
                <select
                  style={inputStyle}
                  value={targetId}
                  onChange={(e) => {
                    setTargetId(e.target.value);
                    syncCustomerFromTarget(e.target.value);
                  }}
                >
                  <option value="">Select record</option>
                  {currentTargetOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <button
              type="button"
              style={{ ...primaryBtn, width: "100%", marginTop: 14, opacity: saving ? 0.65 : 1 }}
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
              <TotalRow label="Visible quote subtotal" value={money(totals.visibleQuoteSubtotal)} />
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
            {warnings.length === 0 ? <div style={okSmall}>No pricing warnings showing.</div> : (
              <div style={{ display: "grid", gap: 8 }}>
                {warnings.map((warning) => <div key={warning} style={warnBox}>{warning}</div>)}
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <div style={sectionHeaderSmall}>
              <h2 style={sectionTitle}>Customer breakdown</h2>
              <button type="button" style={secondaryBtnSmall} onClick={() => copyText(visibleBreakdown, "Customer breakdown copied.")}>Copy</button>
            </div>
            <pre style={preBox}>{visibleBreakdown || "No quote-visible sell lines yet."}</pre>
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

const pageWrap: React.CSSProperties = {
  width: "min(1680px, 100%)",
  margin: "0 auto",
  padding: "0 0 40px",
};

const headerCard: React.CSSProperties = {
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

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 390px",
  gap: 16,
  alignItems: "start",
  marginTop: 16,
};

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
};

const sideColumn: React.CSSProperties = {
  display: "grid",
  gap: 16,
  position: "sticky",
  top: 12,
};

const eyebrow: React.CSSProperties = {
  display: "inline-flex",
  padding: "5px 9px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.08)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: 0.3,
  textTransform: "uppercase",
};

const totalPill: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  minWidth: 220,
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionHeaderSmall: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 1000,
};

const sectionSub: React.CSSProperties = {
  margin: "5px 0 0",
  opacity: 0.72,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 12,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontWeight: 800,
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.16)",
  background: "rgba(255,255,255,0.95)",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 82,
  resize: "vertical",
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 13px",
  borderRadius: 10,
  border: "none",
  background: "#111827",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 13px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.88)",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryBtnSmall: React.CSSProperties = {
  ...secondaryBtn,
  padding: "7px 9px",
  fontSize: 12,
};

const dangerGhostBtn: React.CSSProperties = {
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid rgba(180,0,0,0.22)",
  background: "rgba(255,255,255,0.66)",
  color: "#8a1111",
  fontWeight: 900,
  cursor: "pointer",
};

const phaseCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.58)",
};

const phaseTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 8,
};

const phaseGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 130px 145px 110px repeat(2, minmax(170px, 1fr))",
  gap: 8,
};

const presetWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const chipBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.86)",
  fontWeight: 800,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 1180,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  padding: "8px 7px",
  background: "rgba(0,0,0,0.07)",
  borderBottom: "1px solid rgba(0,0,0,0.1)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 7px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  verticalAlign: "top",
};

const smallInput: React.CSSProperties = {
  ...inputStyle,
  padding: "7px 8px",
  borderRadius: 8,
  minWidth: 92,
};

const tinyInput: React.CSSProperties = {
  ...smallInput,
  width: 86,
  minWidth: 86,
};

const totalRows: React.CSSProperties = {
  display: "grid",
  gap: 9,
  marginTop: 10,
};

const totalRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  paddingBottom: 8,
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const toggleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 12,
  fontWeight: 800,
};

const preBox: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "rgba(0,0,0,0.05)",
  border: "1px solid rgba(0,0,0,0.08)",
  padding: 12,
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13,
  lineHeight: 1.45,
};

const warnBox: React.CSSProperties = {
  padding: "9px 10px",
  borderRadius: 10,
  background: "rgba(255,176,0,0.16)",
  border: "1px solid rgba(190,120,0,0.24)",
  fontWeight: 800,
};

const okSmall: React.CSSProperties = {
  padding: "9px 10px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.22)",
  fontWeight: 800,
};

const successBox: React.CSSProperties = {
  marginTop: 16,
  padding: "11px 13px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.26)",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "11px 13px",
  borderRadius: 12,
  background: "rgba(210,0,0,0.10)",
  border: "1px solid rgba(210,0,0,0.24)",
  fontWeight: 800,
};
