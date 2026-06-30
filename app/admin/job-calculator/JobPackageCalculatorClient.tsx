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
type RouteTone = "ok" | "error" | "idle";

type TransportRouteLine = {
  id: string;
  description: string;
  yardPostcode: string;
  collectionPostcode: string;
  viaStops: string;
  deliveryPostcode: string;
  returnToYard: boolean;
  chargeableMiles: string;
  ratePerMile: string;
  baseRate: string;
  actualMiles: number | null;
  provider: string;
  routeMessage: string;
  routeTone: RouteTone;
  loading: boolean;
  quote: boolean;
};

type CraneLine = {
  id: string;
  description: string;
  qty: string;
  rate: string;
  quote: boolean;
};

type LabourLine = {
  id: string;
  description: string;
  men: string;
  days: string;
  rate: string;
  quote: boolean;
};

type EquipmentLine = {
  id: string;
  item: string;
  qty: string;
  rate: string;
  quote: boolean;
};

type CostLine = {
  id: string;
  item: string;
  amount: string;
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

function splitStops(value: string) {
  return String(value ?? "")
    .split(/[\n;]/g)
    .map((item) => item.replace(/^[\s,>-]+/, "").replace(/[\s,]+$/, "").trim())
    .filter(Boolean);
}

function newTransportRouteLine(overrides: Partial<TransportRouteLine> = {}): TransportRouteLine {
  return {
    id: makeId("route"),
    description: "Transport charge",
    yardPostcode: "SA10 6JY",
    collectionPostcode: "",
    viaStops: "",
    deliveryPostcode: "",
    returnToYard: true,
    chargeableMiles: "",
    ratePerMile: "",
    baseRate: "",
    actualMiles: null,
    provider: "",
    routeMessage: "",
    routeTone: "idle",
    loading: false,
    quote: true,
    ...overrides,
  };
}

function newCraneLine(overrides: Partial<CraneLine> = {}): CraneLine {
  return {
    id: makeId("crane"),
    description: "Crane hire",
    qty: "",
    rate: "",
    quote: true,
    ...overrides,
  };
}

function newLabourLine(overrides: Partial<LabourLine> = {}): LabourLine {
  return {
    id: makeId("labour"),
    description: "Site team / labour",
    men: "",
    days: "1",
    rate: "",
    quote: true,
    ...overrides,
  };
}

function newEquipmentLine(overrides: Partial<EquipmentLine> = {}): EquipmentLine {
  return {
    id: makeId("equipment"),
    item: "",
    qty: "",
    rate: "",
    quote: true,
    ...overrides,
  };
}

function newCostLine(overrides: Partial<CostLine> = {}): CostLine {
  return {
    id: makeId("cost"),
    item: "Supplier / internal cost",
    amount: "",
    ...overrides,
  };
}

function addMoneyLine(lines: PackageCalculatorLine[], input: {
  id: string;
  phase_id?: string;
  item: string;
  description?: string;
  quantity?: string | number;
  rate?: string | number;
  amount?: string | number;
  show_on_quote?: boolean;
}) {
  const hasManualAmount = clean(input.amount) !== "";
  const rawQty = clean(input.quantity);
  const qty = rawQty === "" ? 0 : numberFromAny(input.quantity);
  const rate = numberFromAny(input.rate);
  const amount = hasManualAmount ? numberFromAny(input.amount) : Math.round(qty * rate * 100) / 100;
  if (!clean(input.item) || amount === 0) return;

  lines.push({
    id: input.id,
    phase_id: input.phase_id || "main",
    line_type: "sell",
    item: input.item,
    description: input.description || input.item,
    quantity: rawQty === "" && hasManualAmount ? 1 : input.quantity ?? "",
    rate: input.rate ?? amount,
    amount,
    pricing_mode: "qty_rate",
    show_on_quote: input.show_on_quote !== false,
  });
}

function routeSummary(route: TransportRouteLine) {
  const parts = [
    route.yardPostcode ? `Yard ${route.yardPostcode}` : "",
    route.collectionPostcode ? `collection ${route.collectionPostcode}` : "",
    ...splitStops(route.viaStops).map((stop, index) => `stop ${index + 1} ${stop}`),
    route.deliveryPostcode ? `delivery/site ${route.deliveryPostcode}` : "",
    route.returnToYard && route.yardPostcode ? `return ${route.yardPostcode}` : "",
  ].filter(Boolean);
  return parts.join(" → ");
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
  const [transportRoutes, setTransportRoutes] = useState<TransportRouteLine[]>([newTransportRouteLine({ id: "route-main" })]);
  const [craneLines, setCraneLines] = useState<CraneLine[]>([newCraneLine({ id: "crane-main" })]);
  const [labourLines, setLabourLines] = useState<LabourLine[]>([newLabourLine({ id: "labour-main" })]);
  const [equipmentLines, setEquipmentLines] = useState<EquipmentLine[]>([
    newEquipmentLine({ id: "lifting-beam", item: "Lifting beam" }),
    newEquipmentLine({ id: "crane-mats", item: "Crane mats" }),
    newEquipmentLine({ id: "escort", item: "Escort" }),
    newEquipmentLine({ id: "tracked-carrier", item: "Tracked carrier" }),
  ]);
  const [costLines, setCostLines] = useState<CostLine[]>([newCostLine({ id: "supplier-cost" })]);
  const [manualAdjustment, setManualAdjustment] = useState("");
  const [manualAdjustmentLabel, setManualAdjustmentLabel] = useState("Manual adjustment / rounding");
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

  const phases = useMemo<PackagePhase[]>(() => {
    const output: PackagePhase[] = [{ id: "main", title: "Job price", job_kind: "mixed", work_date: jobDate, notes: customerLabel(selectedCustomer) }];

    transportRoutes.forEach((route, index) => {
      const summary = routeSummary(route);
      const notes = [
        summary,
        route.actualMiles ? `HGV actual miles: ${route.actualMiles.toFixed(1)}` : "",
        route.chargeableMiles ? `Chargeable miles: ${route.chargeableMiles}` : "",
        route.provider ? `Route provider: ${route.provider}` : "",
      ].filter(Boolean).join(" | ");

      output.push({
        id: route.id,
        title: `Route ${index + 1}`,
        job_kind: "transport",
        from_location: route.collectionPostcode || route.yardPostcode,
        to_location: route.deliveryPostcode || splitStops(route.viaStops).slice(-1)[0] || route.yardPostcode,
        work_date: jobDate,
        loads: 1,
        notes,
      });
    });

    return output;
  }, [transportRoutes, jobDate, selectedCustomer]);

  const lines = useMemo<PackageCalculatorLine[]>(() => {
    const output: PackageCalculatorLine[] = [];

    transportRoutes.forEach((route, index) => {
      const miles = numberFromAny(route.chargeableMiles);
      const mileRate = numberFromAny(route.ratePerMile);
      const summary = routeSummary(route);
      const routeLabel = route.description || `Transport route ${index + 1}`;

      addMoneyLine(output, {
        id: `${route.id}-base`,
        phase_id: route.id,
        item: routeLabel,
        description: summary || routeLabel,
        quantity: 1,
        rate: route.baseRate,
        amount: route.baseRate,
        show_on_quote: route.quote,
      });

      addMoneyLine(output, {
        id: `${route.id}-mileage`,
        phase_id: route.id,
        item: `${routeLabel} mileage`,
        description: `${miles || 0} miles × ${money(mileRate)} per mile${summary ? ` | ${summary}` : ""}`,
        quantity: route.chargeableMiles,
        rate: route.ratePerMile,
        show_on_quote: route.quote,
      });
    });

    craneLines.forEach((line) => {
      addMoneyLine(output, {
        id: line.id,
        phase_id: "main",
        item: line.description || "Crane hire",
        description: line.description || "Crane hire",
        quantity: line.qty,
        rate: line.rate,
        show_on_quote: line.quote,
      });
    });

    labourLines.forEach((line) => {
      const men = numberFromAny(line.men);
      const days = numberFromAny(line.days) || 1;
      const labourRate = numberFromAny(line.rate);
      if (men > 0 && labourRate > 0) {
        output.push({
          id: line.id,
          phase_id: "main",
          line_type: "sell",
          item: line.description || "Site team / labour",
          description: `${men} men × ${days} day(s) × ${money(labourRate)}`,
          quantity: men * days,
          rate: labourRate,
          amount: Math.round(men * days * labourRate * 100) / 100,
          pricing_mode: "qty_rate",
          show_on_quote: line.quote,
        });
      }
    });

    equipmentLines.forEach((line) => {
      addMoneyLine(output, {
        id: line.id,
        phase_id: "main",
        item: line.item,
        description: line.item,
        quantity: line.qty,
        rate: line.rate,
        show_on_quote: line.quote,
      });
    });

    addMoneyLine(output, {
      id: "manual-adjustment",
      phase_id: "main",
      item: manualAdjustmentLabel || "Manual adjustment",
      description: manualAdjustmentLabel || "Manual adjustment",
      quantity: 1,
      rate: manualAdjustment,
      amount: manualAdjustment,
      show_on_quote: false,
    });

    costLines.forEach((line) => {
      const amount = numberFromAny(line.amount);
      if (amount > 0) {
        output.push({
          id: line.id,
          phase_id: "main",
          line_type: "cost",
          item: line.item || "Supplier / internal cost",
          description: `${line.item || "Supplier / internal cost"} for margin only`,
          quantity: 1,
          rate: amount,
          amount,
          pricing_mode: "fixed",
          show_on_quote: false,
        });
      }
    });

    return output;
  }, [transportRoutes, craneLines, labourLines, equipmentLines, costLines, manualAdjustment, manualAdjustmentLabel]);

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

    transportRoutes.forEach((route, index) => {
      const label = `Route ${index + 1}`;
      if (numberFromAny(route.chargeableMiles) > 0 && numberFromAny(route.ratePerMile) === 0) list.push(`${label}: miles entered but rate per mile is blank.`);
      if (numberFromAny(route.ratePerMile) > 0 && numberFromAny(route.chargeableMiles) === 0) list.push(`${label}: rate per mile entered but chargeable miles is blank.`);
      if ((clean(route.collectionPostcode) || clean(route.deliveryPostcode) || clean(route.viaStops)) && !route.actualMiles) list.push(`${label}: HGV mileage has not been calculated yet. Use Calculate, or enter checked miles manually.`);
      if (route.provider.includes("fallback")) list.push(`${label}: HGV routing fell back to standard road routing. Check restrictions, low bridges and access.`);
    });

    if (totals.grossProfit < 0) list.push("This price is showing a loss.");
    if (totals.sellSubtotal > 0 && totals.marginPercent < 20) list.push("Margin is under 20%. Check before issuing.");
    if ((target === "crane_job" || target === "transport_job" || target === "quote") && !targetId) list.push("Select a target record before applying the calculator.");
    if ((target === "new_quote" || target === "quote") && !customerId) list.push("Select a customer before saving to a quote.");
    return list;
  }, [totals, target, targetId, customerId, transportRoutes]);

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

  function updateTransportRoute(id: string, patch: Partial<TransportRouteLine>) {
    setTransportRoutes((current) => current.map((route) => (route.id === id ? {
      ...route,
      ...patch,
      ...(patch.yardPostcode !== undefined || patch.collectionPostcode !== undefined || patch.viaStops !== undefined || patch.deliveryPostcode !== undefined || patch.returnToYard !== undefined
        ? { actualMiles: null, provider: "", routeMessage: "", routeTone: "idle" as RouteTone }
        : {}),
    } : route)));
  }

  function addTransportRoute() {
    const previous = transportRoutes[transportRoutes.length - 1];
    setTransportRoutes((current) => [...current, newTransportRouteLine({
      yardPostcode: previous?.yardPostcode || "SA10 6JY",
      ratePerMile: previous?.ratePerMile || "",
      returnToYard: previous?.returnToYard ?? true,
      description: `Transport charge ${current.length + 1}`,
    })]);
  }

  function removeTransportRoute(id: string) {
    setTransportRoutes((current) => current.length <= 1 ? current : current.filter((route) => route.id !== id));
  }

  function updateCraneLine(id: string, patch: Partial<CraneLine>) {
    setCraneLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addCraneLine() {
    setCraneLines((current) => [...current, newCraneLine({ description: `Crane hire ${current.length + 1}` })]);
  }

  function removeCraneLine(id: string) {
    setCraneLines((current) => current.length <= 1 ? current : current.filter((line) => line.id !== id));
  }

  function updateLabourLine(id: string, patch: Partial<LabourLine>) {
    setLabourLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLabourLine() {
    setLabourLines((current) => [...current, newLabourLine({ description: `Site team / labour ${current.length + 1}` })]);
  }

  function removeLabourLine(id: string) {
    setLabourLines((current) => current.length <= 1 ? current : current.filter((line) => line.id !== id));
  }

  function updateEquipment(id: string, patch: Partial<EquipmentLine>) {
    setEquipmentLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addEquipmentLine() {
    setEquipmentLines((current) => [...current, newEquipmentLine()]);
  }

  function removeEquipmentLine(id: string) {
    setEquipmentLines((current) => current.filter((line) => line.id !== id));
  }

  function updateCostLine(id: string, patch: Partial<CostLine>) {
    setCostLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addCostLine() {
    setCostLines((current) => [...current, newCostLine({ item: `Supplier / internal cost ${current.length + 1}` })]);
  }

  function removeCostLine(id: string) {
    setCostLines((current) => current.length <= 1 ? current : current.filter((line) => line.id !== id));
  }

  function syncCustomerFromTarget(nextTargetId: string) {
    if (!nextTargetId) return;
    if (target === "crane_job") {
      const job = craneJobs.find((row) => row.id === nextTargetId);
      if (job?.client_id) setCustomerId(job.client_id);
      if (job?.site_address) {
        setTransportRoutes((current) => current.map((route, index) => index === 0 ? { ...route, deliveryPostcode: job.site_address || "", actualMiles: null, provider: "", routeMessage: "", routeTone: "idle" } : route));
      }
    }
    if (target === "transport_job") {
      const job = transportJobs.find((row) => row.id === nextTargetId);
      if (job?.client_id) setCustomerId(job.client_id);
      setTransportRoutes((current) => current.map((route, index) => index === 0 ? {
        ...route,
        collectionPostcode: job?.collection_address || "",
        deliveryPostcode: job?.delivery_address || "",
        actualMiles: null,
        provider: "",
        routeMessage: "",
        routeTone: "idle",
      } : route));
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

  function buildRouteText() {
    return transportRoutes
      .filter((route) => routeSummary(route) || route.chargeableMiles)
      .map((route, index) => [
        `Route ${index + 1}: ${route.description || "Transport charge"}`,
        routeSummary(route),
        route.actualMiles ? `HGV actual miles: ${route.actualMiles.toFixed(1)}` : "",
        route.chargeableMiles ? `Chargeable miles: ${route.chargeableMiles}` : "",
      ].filter(Boolean).join("\n"))
      .join("\n\n");
  }

  function buildQuoteText() {
    const route = buildRouteText();

    return [
      `COST SUMMARY:\n${money(totals.sellSubtotal)} + VAT`,
      route ? `ROUTE / SITE:\n${route}` : "",
      `BREAKDOWN:\n${visibleBreakdown || "No customer lines entered."}`,
      scope ? `SCOPE OF WORK:\n${scope}` : "",
      notes ? `ADDITIONAL NOTES:\n${notes}` : "",
      `PAYMENT TERMS:\n${paymentTerms}`,
    ].filter(Boolean).join("\n\n");
  }

  function resetCalculator() {
    setPackageTitle("Simple job price");
    setJobDate(todayIso);
    setTransportRoutes([newTransportRouteLine({ id: "route-main" })]);
    setCraneLines([newCraneLine({ id: "crane-main" })]);
    setLabourLines([newLabourLine({ id: "labour-main" })]);
    setEquipmentLines([
      newEquipmentLine({ id: "lifting-beam", item: "Lifting beam" }),
      newEquipmentLine({ id: "crane-mats", item: "Crane mats" }),
      newEquipmentLine({ id: "escort", item: "Escort" }),
      newEquipmentLine({ id: "tracked-carrier", item: "Tracked carrier" }),
    ]);
    setCostLines([newCostLine({ id: "supplier-cost" })]);
    setManualAdjustment("");
    setMessage(null);
  }

  async function calculateHgvMileage(routeId: string) {
    const route = transportRoutes.find((item) => item.id === routeId);
    if (!route) return;

    updateTransportRoute(routeId, { loading: true, routeMessage: "", routeTone: "idle" });

    try {
      const res = await fetch("/api/admin/job-calculator/route-mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yard_postcode: route.yardPostcode,
          collection_postcode: route.collectionPostcode,
          via_stops: splitStops(route.viaStops),
          delivery_postcode: route.deliveryPostcode,
          return_to_yard: route.returnToYard,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        updateTransportRoute(routeId, { loading: false, routeTone: "error", routeMessage: data?.error || "Could not calculate HGV mileage." });
        return;
      }

      const chargeable = Number(data?.chargeable_miles ?? 0);
      const actual = Number(data?.actual_miles ?? chargeable);
      const provider = String(data?.provider || "openrouteservice-hgv");
      const routeNote = String(data?.note || "");

      updateTransportRoute(routeId, {
        loading: false,
        chargeableMiles: chargeable ? String(chargeable) : "",
        actualMiles: Number.isFinite(actual) && actual > 0 ? actual : null,
        provider,
        routeTone: provider.includes("fallback") ? "error" : "ok",
        routeMessage: `HGV route calculated: ${actual.toFixed(1)} actual miles. Chargeable miles set to ${chargeable}. ${routeNote}`.trim(),
      });
    } catch (error: any) {
      updateTransportRoute(routeId, { loading: false, routeTone: "error", routeMessage: error?.message || "Could not calculate HGV mileage." });
    }
  }

  async function calculateAllHgvMileage() {
    for (const route of transportRoutes) {
      const hasRoute = clean(route.collectionPostcode) || clean(route.viaStops) || clean(route.deliveryPostcode);
      if (hasRoute) {
        // eslint-disable-next-line no-await-in-loop
        await calculateHgvMileage(route.id);
      }
    }
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
          site_location: transportRoutes.map(routeSummary).filter(Boolean).join(" | "),
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
            Multiple routes, multiple cranes, multiple teams, lifting equipment, supplier costs and margin. Nothing is saved until you choose a target and press apply.
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
                <p style={sectionSub}>Select customer and set the basic quote/job details.</p>
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
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Postcodes / mileage</h2>
                <p style={sectionSub}>Add as many HGV route lines as needed. Each line can have via stops, one per line, for multi-drop work.</p>
              </div>
              <div style={buttonGroup}>
                <button type="button" style={secondaryBtn} onClick={calculateAllHgvMileage}>Calculate all</button>
                <button type="button" style={primaryBtn} onClick={addTransportRoute}>+ Add route</button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {transportRoutes.map((route, index) => (
                <div key={route.id} style={subCard}>
                  <div style={subHeader}>
                    <h3 style={subTitle}>Route {index + 1}</h3>
                    <div style={buttonGroup}>
                      <button
                        type="button"
                        style={{ ...primaryBtn, opacity: route.loading ? 0.65 : 1 }}
                        disabled={route.loading}
                        onClick={() => calculateHgvMileage(route.id)}
                      >
                        {route.loading ? "Calculating..." : "Calculate HGV miles"}
                      </button>
                      <button type="button" style={dangerGhostBtn} onClick={() => removeTransportRoute(route.id)} disabled={transportRoutes.length <= 1}>Remove</button>
                    </div>
                  </div>

                  {route.routeMessage ? <div style={route.routeTone === "ok" ? successBoxSmall : errorBoxSmall}>{route.routeMessage}</div> : null}

                  <div style={routeGrid}>
                    <label style={fieldStyle}>Description
                      <input style={inputStyle} value={route.description} onChange={(e) => updateTransportRoute(route.id, { description: e.target.value })} />
                    </label>
                    <label style={fieldStyle}>Yard postcode
                      <input style={inputStyle} value={route.yardPostcode} onChange={(e) => updateTransportRoute(route.id, { yardPostcode: e.target.value })} placeholder="SA10 6JY" />
                    </label>
                    <label style={fieldStyle}>Collection postcode / address
                      <input style={inputStyle} value={route.collectionPostcode} onChange={(e) => updateTransportRoute(route.id, { collectionPostcode: e.target.value })} placeholder="e.g. SA14 6RF" />
                    </label>
                    <label style={fieldStyle}>Via stops / extra drops
                      <textarea style={smallTextareaStyle} value={route.viaStops} onChange={(e) => updateTransportRoute(route.id, { viaStops: e.target.value })} placeholder={"One per line\nPontypool\nHereford"} />
                    </label>
                    <label style={fieldStyle}>Delivery / site postcode
                      <input style={inputStyle} value={route.deliveryPostcode} onChange={(e) => updateTransportRoute(route.id, { deliveryPostcode: e.target.value })} placeholder="e.g. BB10 4QF" />
                    </label>
                    <label style={checkField}>
                      <input type="checkbox" checked={route.returnToYard} onChange={(e) => updateTransportRoute(route.id, { returnToYard: e.target.checked })} />
                      Return to yard included
                    </label>
                    <label style={fieldStyle}>Chargeable miles
                      <input style={inputStyle} inputMode="decimal" value={route.chargeableMiles} onChange={(e) => updateTransportRoute(route.id, { chargeableMiles: e.target.value, actualMiles: null, provider: "" })} placeholder="Calculate or enter manually" />
                    </label>
                    <label style={fieldStyle}>Rate per mile
                      <input style={inputStyle} inputMode="decimal" value={route.ratePerMile} onChange={(e) => updateTransportRoute(route.id, { ratePerMile: e.target.value })} placeholder="e.g. 1.10 or 4.50" />
                    </label>
                    <label style={fieldStyle}>Base transport rate
                      <input style={inputStyle} inputMode="decimal" value={route.baseRate} onChange={(e) => updateTransportRoute(route.id, { baseRate: e.target.value })} placeholder="Optional" />
                    </label>
                    <label style={smallCheck}><input type="checkbox" checked={route.quote} onChange={(e) => updateTransportRoute(route.id, { quote: e.target.checked })} /> Quote</label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Cranes</h2>
                <p style={sectionSub}>Add one line per crane, visit or crane package.</p>
              </div>
              <button type="button" style={primaryBtn} onClick={addCraneLine}>+ Add crane</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {craneLines.map((line) => (
                <div key={line.id} style={simpleLineGrid}>
                  <input style={inputStyle} value={line.description} onChange={(e) => updateCraneLine(line.id, { description: e.target.value })} placeholder="Crane description" />
                  <input style={inputStyle} inputMode="decimal" value={line.qty} onChange={(e) => updateCraneLine(line.id, { qty: e.target.value })} placeholder="Qty / visits" />
                  <input style={inputStyle} inputMode="decimal" value={line.rate} onChange={(e) => updateCraneLine(line.id, { rate: e.target.value })} placeholder="Rate" />
                  <label style={smallCheck}><input type="checkbox" checked={line.quote} onChange={(e) => updateCraneLine(line.id, { quote: e.target.checked })} /> Quote</label>
                  <button type="button" style={dangerGhostBtn} onClick={() => removeCraneLine(line.id)} disabled={craneLines.length <= 1}>Remove</button>
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Men / labour</h2>
                <p style={sectionSub}>Add one line per labour team/rate, for example 3 men at £450 each over 2 days.</p>
              </div>
              <button type="button" style={primaryBtn} onClick={addLabourLine}>+ Add labour</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {labourLines.map((line) => (
                <div key={line.id} style={labourLineGrid}>
                  <input style={inputStyle} value={line.description} onChange={(e) => updateLabourLine(line.id, { description: e.target.value })} placeholder="Labour description" />
                  <input style={inputStyle} inputMode="decimal" value={line.men} onChange={(e) => updateLabourLine(line.id, { men: e.target.value })} placeholder="Men" />
                  <input style={inputStyle} inputMode="decimal" value={line.days} onChange={(e) => updateLabourLine(line.id, { days: e.target.value })} placeholder="Days" />
                  <input style={inputStyle} inputMode="decimal" value={line.rate} onChange={(e) => updateLabourLine(line.id, { rate: e.target.value })} placeholder="Rate per man" />
                  <label style={smallCheck}><input type="checkbox" checked={line.quote} onChange={(e) => updateLabourLine(line.id, { quote: e.target.checked })} /> Quote</label>
                  <button type="button" style={dangerGhostBtn} onClick={() => removeLabourLine(line.id)} disabled={labourLines.length <= 1}>Remove</button>
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyle}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Lifting equipment / extras</h2>
                <p style={sectionSub}>Add lifting beams, mats, escorts, tracked carrier or any other extra.</p>
              </div>
              <button type="button" style={primaryBtn} onClick={addEquipmentLine}>+ Add extra</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {equipmentLines.map((line) => (
                <div key={line.id} style={simpleLineGrid}>
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
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Costs, margin and notes</h2>
                <p style={sectionSub}>Cost lines are hidden from the customer and only used for profit/margin.</p>
              </div>
              <button type="button" style={primaryBtn} onClick={addCostLine}>+ Add cost</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {costLines.map((line) => (
                <div key={line.id} style={costLineGrid}>
                  <input style={inputStyle} value={line.item} onChange={(e) => updateCostLine(line.id, { item: e.target.value })} placeholder="Cost description" />
                  <input style={inputStyle} inputMode="decimal" value={line.amount} onChange={(e) => updateCostLine(line.id, { amount: e.target.value })} placeholder="Cost amount" />
                  <button type="button" style={dangerGhostBtn} onClick={() => removeCostLine(line.id)} disabled={costLines.length <= 1}>Remove</button>
                </div>
              ))}
            </div>

            <div style={{ ...formGrid, marginTop: 12 }}>
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

const subCard: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.58)",
  border: "1px solid rgba(0,0,0,0.08)",
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

const subHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 10,
};

const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 1000,
};

const subTitle: CSSProperties = {
  margin: 0,
  fontSize: 16,
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

const routeGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const simpleLineGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) 90px 120px 90px 90px",
  gap: 8,
  alignItems: "center",
};

const labourLineGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) 80px 80px 120px 90px 90px",
  gap: 8,
  alignItems: "center",
};

const costLineGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) 130px 90px",
  gap: 8,
  alignItems: "center",
};

const buttonGroup: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
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

const smallTextareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 42,
  resize: "vertical",
  fontFamily: "inherit",
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
  maxHeight: 360,
  overflow: "auto",
};

const successBox: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(22,163,74,0.14)",
  border: "1px solid rgba(22,163,74,0.25)",
  color: "#14532d",
  fontWeight: 800,
};

const errorBox: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(220,38,38,0.12)",
  border: "1px solid rgba(220,38,38,0.22)",
  color: "#7f1d1d",
  fontWeight: 800,
};

const successBoxSmall: CSSProperties = {
  ...successBox,
  marginTop: 0,
  marginBottom: 10,
  padding: 9,
  fontSize: 13,
};

const errorBoxSmall: CSSProperties = {
  ...errorBox,
  marginTop: 0,
  marginBottom: 10,
  padding: 9,
  fontSize: 13,
};

const warnBox: CSSProperties = {
  padding: 9,
  borderRadius: 10,
  background: "rgba(245,158,11,0.15)",
  border: "1px solid rgba(245,158,11,0.28)",
  color: "#78350f",
  fontWeight: 800,
  fontSize: 13,
};

const okSmall: CSSProperties = {
  padding: 9,
  borderRadius: 10,
  background: "rgba(22,163,74,0.12)",
  color: "#14532d",
  fontWeight: 800,
  fontSize: 13,
};
