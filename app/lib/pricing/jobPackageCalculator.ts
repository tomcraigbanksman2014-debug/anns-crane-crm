export type PackagePricingMode = "fixed" | "qty_rate" | "cost_uplift";
export type PackageLineType = "sell" | "cost";

export type PackagePhase = {
  id: string;
  title: string;
  job_kind: "transport" | "crane" | "mixed";
  from_location?: string;
  to_location?: string;
  work_date?: string;
  loads?: number | string;
  notes?: string;
};

export type PackageCalculatorLine = {
  id: string;
  phase_id?: string | null;
  line_type: PackageLineType;
  item: string;
  description?: string;
  quantity?: number | string;
  rate?: number | string;
  amount?: number | string;
  cost_amount?: number | string;
  uplift_percent?: number | string;
  pricing_mode?: PackagePricingMode;
  show_on_quote?: boolean;
  notes?: string;
};

export type PackageTotals = {
  sellSubtotal: number;
  hiddenCostTotal: number;
  explicitCostTotal: number;
  costSubtotal: number;
  grossProfit: number;
  marginPercent: number;
  vat: number;
  invoiceTotal: number;
  visibleQuoteSubtotal: number;
};

export type CommercialBreakdownLine = {
  id: string;
  line_type: PackageLineType;
  item: string;
  description: string;
  date_from: string;
  date_to: string;
  quantity: string;
  rate: string;
  amount: number;
  notes: string;
  phase_id?: string | null;
  source?: string;
  show_on_quote?: boolean;
  cost_amount?: number;
  uplift_percent?: number;
  pricing_mode?: PackagePricingMode;
};

export function numberFromAny(value: unknown) {
  const raw = String(value ?? "")
    .replace(/£/g, "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();

  if (!raw) return 0;

  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function money(value: unknown) {
  return `£${numberFromAny(value).toFixed(2)}`;
}

export function calculatePackageLineAmount(line: PackageCalculatorLine) {
  const quantity = numberFromAny(line.quantity || 1) || 1;
  const rate = numberFromAny(line.rate);
  const manualAmount = numberFromAny(line.amount);
  const costAmount = numberFromAny(line.cost_amount);
  const upliftPercent = numberFromAny(line.uplift_percent);
  const mode = line.pricing_mode ?? "fixed";

  if (line.line_type === "cost") {
    return manualAmount || roundMoney(quantity * rate);
  }

  if (mode === "cost_uplift") {
    return roundMoney(costAmount * (1 + upliftPercent / 100));
  }

  if (mode === "qty_rate") {
    return roundMoney(quantity * rate);
  }

  return manualAmount || roundMoney(quantity * rate);
}

export function calculatePackageTotals(lines: PackageCalculatorLine[]): PackageTotals {
  const sellSubtotal = roundMoney(
    lines
      .filter((line) => line.line_type === "sell")
      .reduce((sum, line) => sum + calculatePackageLineAmount(line), 0)
  );

  const hiddenCostTotal = roundMoney(
    lines
      .filter((line) => line.line_type === "sell")
      .reduce((sum, line) => sum + numberFromAny(line.cost_amount), 0)
  );

  const explicitCostTotal = roundMoney(
    lines
      .filter((line) => line.line_type === "cost")
      .reduce((sum, line) => sum + calculatePackageLineAmount(line), 0)
  );

  const costSubtotal = roundMoney(hiddenCostTotal + explicitCostTotal);
  const grossProfit = roundMoney(sellSubtotal - costSubtotal);
  const marginPercent = sellSubtotal > 0 ? roundMoney((grossProfit / sellSubtotal) * 100) : 0;
  const vat = roundMoney(sellSubtotal * 0.2);
  const invoiceTotal = roundMoney(sellSubtotal + vat);
  const visibleQuoteSubtotal = roundMoney(
    lines
      .filter((line) => line.line_type === "sell" && line.show_on_quote !== false)
      .reduce((sum, line) => sum + calculatePackageLineAmount(line), 0)
  );

  return {
    sellSubtotal,
    hiddenCostTotal,
    explicitCostTotal,
    costSubtotal,
    grossProfit,
    marginPercent,
    vat,
    invoiceTotal,
    visibleQuoteSubtotal,
  };
}

export function toCommercialBreakdownLines(
  lines: PackageCalculatorLine[],
  phases: PackagePhase[] = []
): CommercialBreakdownLine[] {
  const phaseMap = new Map(phases.map((phase) => [phase.id, phase]));
  const output: CommercialBreakdownLine[] = [];

  lines
    .filter((line) => String(line.item ?? "").trim() || String(line.description ?? "").trim() || calculatePackageLineAmount(line) !== 0)
    .forEach((line, index) => {
      const phase = line.phase_id ? phaseMap.get(line.phase_id) : null;
      const amount = calculatePackageLineAmount(line);
      const quantity = String(line.quantity ?? "").trim();
      const rate = String(line.rate ?? "").trim();
      const phasePrefix = phase?.title ? `${phase.title}: ` : "";
      const item = String(line.item ?? "").trim();
      const hiddenCost = numberFromAny(line.cost_amount);

      output.push({
        id: String(line.id || `package-line-${index + 1}`),
        line_type: line.line_type,
        item,
        description: `${phasePrefix}${String(line.description ?? "").trim()}`.trim(),
        date_from: String(phase?.work_date ?? "").slice(0, 10),
        date_to: String(phase?.work_date ?? "").slice(0, 10),
        quantity,
        rate,
        amount,
        notes: String(line.notes ?? "").trim(),
        phase_id: line.phase_id ?? null,
        source: "job_package_calculator",
        show_on_quote: line.show_on_quote !== false,
        cost_amount: hiddenCost,
        uplift_percent: numberFromAny(line.uplift_percent),
        pricing_mode: line.pricing_mode ?? "fixed",
      });

      // Existing job detail pages calculate margin from explicit `cost` lines.
      // Therefore hidden costs on sell lines are also saved as non-quote cost lines.
      if (line.line_type === "sell" && hiddenCost > 0) {
        output.push({
          id: `${String(line.id || `package-line-${index + 1}`)}-hidden-cost`,
          line_type: "cost",
          item: `${item || "Package item"} hidden cost`,
          description: `${phasePrefix}Hidden cost held for margin only`.trim(),
          date_from: String(phase?.work_date ?? "").slice(0, 10),
          date_to: String(phase?.work_date ?? "").slice(0, 10),
          quantity: "",
          rate: "",
          amount: hiddenCost,
          notes: "Auto-created from hidden cost/uplift calculator line. Not for customer quote display.",
          phase_id: line.phase_id ?? null,
          source: "job_package_calculator",
          show_on_quote: false,
          cost_amount: hiddenCost,
          uplift_percent: numberFromAny(line.uplift_percent),
          pricing_mode: "fixed",
        });
      }
    });

  return output;
}

export function buildCustomerBreakdownText(lines: PackageCalculatorLine[], phases: PackagePhase[] = []) {
  const phaseMap = new Map(phases.map((phase) => [phase.id, phase]));

  return lines
    .filter((line) => line.line_type === "sell" && line.show_on_quote !== false)
    .map((line) => {
      const phaseTitle = line.phase_id ? phaseMap.get(line.phase_id)?.title : "";
      const prefix = phaseTitle ? `${phaseTitle} - ` : "";
      return `- ${prefix}${String(line.item ?? "").trim()} — ${money(calculatePackageLineAmount(line))}`;
    })
    .join("\n");
}

export function buildInternalCostText(lines: PackageCalculatorLine[], phases: PackagePhase[] = []) {
  const phaseMap = new Map(phases.map((phase) => [phase.id, phase]));

  return lines
    .filter((line) => line.line_type === "cost" || numberFromAny(line.cost_amount) > 0)
    .map((line) => {
      const phaseTitle = line.phase_id ? phaseMap.get(line.phase_id)?.title : "";
      const prefix = phaseTitle ? `${phaseTitle} - ` : "";
      const cost = line.line_type === "cost" ? calculatePackageLineAmount(line) : numberFromAny(line.cost_amount);
      return `- ${prefix}${String(line.item ?? "").trim()} cost — ${money(cost)}`;
    })
    .join("\n");
}
