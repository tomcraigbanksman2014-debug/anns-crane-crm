import { NextResponse } from "next/server";
import { requireApiUser } from "../../lib/apiAuth";
import { getAccessContext } from "../../lib/access";
import { runGlobalSearch } from "../../lib/global-search";
import { writeAuditLog } from "../../lib/audit";
import { assertOperatorAvailable } from "../../lib/staffAvailability";
import { CRANE_JOB_SITE_CONTACT_ERROR, TRANSPORT_JOB_SITE_CONTACT_ERROR, assertRequiredCraneJobSiteContact, assertRequiredTransportJobSiteContact } from "../../lib/jobContactValidation";

type RiskLevel = "low" | "medium" | "high";

type AssistantAction =
  | "help"
  | "search"
  | "navigate"
  | "open_job"
  | "open_transport_job"
  | "open_lift_plan"
  | "open_lift_plan_pack"
  | "open_customer"
  | "open_quote"
  | "check_job_missing_info"
  | "create_crane_job_draft"
  | "create_transport_job_draft"
  | "create_customer_draft"
  | "create_supplier_draft"
  | "create_operator_draft"
  | "create_crane_draft"
  | "create_vehicle_draft"
  | "move_job_draft"
  | "move_transport_job_draft"
  | "assign_operator_draft"
  | "assign_crane_draft"
  | "assign_vehicle_draft"
  | "update_job_status_draft"
  | "update_transport_status_draft"
  | "update_invoice_status_draft"
  | "mark_visit_invoiced_draft"
  | "add_note_draft"
  | "update_site_draft"
  | "cancel_record_draft"
  | "archive_record_draft"
  | "restore_record_draft"
  | "lock_lift_plan_draft"
  | "unlock_lift_plan_draft"
  | "unknown";

type EntityType =
  | "job"
  | "transport_job"
  | "customer"
  | "supplier"
  | "operator"
  | "crane"
  | "vehicle"
  | "quote"
  | "purchase_order"
  | "lift_plan"
  | "unknown";

type ParsedCommand = {
  action: AssistantAction;
  confidence: number;
  entity_type: EntityType;
  job_number: number | null;
  transport_number: string | null;
  customer_name: string | null;
  supplier_name: string | null;
  crane_name: string | null;
  operator_name: string | null;
  vehicle_name: string | null;
  quote_reference: string | null;
  po_reference: string | null;
  page_name: string | null;
  date_text: string | null;
  target_date: string | null;
  end_date: string | null;
  visit_date: string | null;
  status: string | null;
  invoice_status: string | null;
  site_name: string | null;
  site_address: string | null;
  collection_address: string | null;
  delivery_address: string | null;
  load_description: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  amount: number | null;
  search_query: string | null;
  dangerous: boolean;
};

type AssistantResult = {
  label: string;
  href?: string;
  description?: string;
  badge?: string;
};

type DraftPreviewRow = {
  label: string;
  value: string;
};

type DraftAction = {
  type: string;
  title: string;
  risk: RiskLevel;
  warning?: string | null;
  requires_reason?: boolean;
  requires_confirm_text?: boolean;
  confirm_text?: string | null;
  preview: DraftPreviewRow[];
  payload: Record<string, any>;
};

type ResolveResult<T = any> = {
  selected: T | null;
  matches: T[];
  score: number;
  warning: string | null;
};

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isIsoDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim());
}

function isoDateLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentTodayIso() {
  return isoDateLocal(new Date());
}

function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = parseDateOnly(value);
  if (!d) return String(value);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function addDays(dateIso: string, days: number) {
  const d = parseDateOnly(dateIso);
  if (!d) return dateIso;
  d.setDate(d.getDate() + days);
  return isoDateLocal(d);
}

function daysBetween(startIso: string, endIso: string) {
  const start = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function dateOnlyFromTimestamp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const fallback = raw.slice(0, 10);
  return isIsoDate(fallback) ? fallback : null;
}

function timeOnlyFromTimestamp(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/T(\d{2}:\d{2})/);
  if (match?.[1]) return match[1];
  const timeMatch = raw.match(/^(\d{2}:\d{2})/);
  if (timeMatch?.[1]) return timeMatch[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function shiftTimestampDate(value: string | null | undefined, deltaDays: number) {
  const date = dateOnlyFromTimestamp(value);
  if (!date) return null;
  const time = timeOnlyFromTimestamp(value) ?? "08:00";
  return `${addDays(date, deltaDays)}T${time}:00`;
}

function safeLike(value: string) {
  return `%${String(value ?? "").replace(/[%_,]/g, " ").trim()}%`;
}

function normaliseName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/limited/g, "ltd")
    .replace(/\bthe\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string) {
  return new Set(
    normaliseName(value)
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length > 1)
  );
}

function similarityScore(query: string, candidate: string) {
  const q = normaliseName(query);
  const c = normaliseName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.86;

  const qTokens = tokenSet(q);
  const cTokens = tokenSet(c);
  if (!qTokens.size || !cTokens.size) return 0;

  let overlap = 0;
  qTokens.forEach((token) => {
    if (cTokens.has(token)) overlap += 1;
    else if ([...cTokens].some((ct) => ct.includes(token) || token.includes(ct))) overlap += 0.7;
  });

  const tokenScore = overlap / Math.max(qTokens.size, cTokens.size);
  const compactQ = q.replace(/\s+/g, "");
  const compactC = c.replace(/\s+/g, "");
  const prefixScore = compactC.startsWith(compactQ.slice(0, Math.min(5, compactQ.length))) ? 0.25 : 0;
  return Math.min(0.84, tokenScore + prefixScore);
}

function rankMatches<T>(rows: T[], query: string, label: (row: T) => string): ResolveResult<T> {
  const wanted = clean(query);
  if (!wanted) return { selected: null, matches: [], score: 0, warning: null };

  const scored = rows
    .map((row) => ({ row, score: similarityScore(wanted, label(row)) }))
    .filter((entry) => entry.score > 0.15)
    .sort((a, b) => b.score - a.score);

  const selected = scored[0]?.row ?? null;
  const score = scored[0]?.score ?? 0;
  const bestLabel = selected ? label(selected) : null;
  const warning = selected && score < 0.86 ? `I matched "${bestLabel}" from "${wanted}". Check this before confirming.` : null;

  return {
    selected: score >= 0.28 ? selected : null,
    matches: scored.slice(0, 8).map((entry) => entry.row),
    score,
    warning,
  };
}

function stripCommandNoise(value: string) {
  return String(value ?? "")
    .replace(/\b(show|find|open|me|job|jobs|customer|customers|for|the|this|week|needing|need|needs|lift|plans|planner|please|can|you)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseSpeechText(value: string) {
  let text = String(value ?? "").trim();
  text = text.replace(/\blift\s+lamp\b/gi, "lift plan");
  text = text.replace(/\bleft\s+plan\b/gi, "lift plan");
  text = text.replace(/\bcrane\s+plan\b/gi, "lift plan");
  text = text.replace(/\bjob\s+hash\s*(\d+)/gi, "job $1");
  text = text.replace(/\bjob\s+number\s*(\d+)/gi, "job $1");
  text = text.replace(/\bopen\s+open\b/gi, "open");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function mondayOf(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function weekBoundsFromCommand(command: string) {
  const lower = String(command ?? "").toLowerCase();
  const start = mondayOf(new Date());
  if (/\bnext week\b/.test(lower)) start.setDate(start.getDate() + 7);
  if (/\blast week\b/.test(lower)) start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: isoDateLocal(start), end: isoDateLocal(end) };
}

function resolveDate(dateText: string | null | undefined, targetDate?: string | null) {
  const target = clean(targetDate);
  if (target && isIsoDate(target)) return target;

  const raw = String(dateText ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (isIsoDate(raw)) return raw;

  const ddmmyyyy = raw.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const rawYear = ddmmyyyy[3] ?? String(new Date().getFullYear());
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const iso = `${year}-${month}-${day}`;
    if (parseDateOnly(iso)) return iso;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (/\btoday\b/.test(raw)) return isoDateLocal(today);
  if (/\btomorrow\b/.test(raw)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return isoDateLocal(d);
  }
  if (/\byesterday\b/.test(raw)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return isoDateLocal(d);
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const matchDay = Object.keys(weekdays).find((day) => raw.includes(day));
  if (matchDay) {
    const wanted = weekdays[matchDay];
    const current = today.getDay();
    let diff = wanted - current;
    if (diff < 0) diff += 7;
    if (/\bnext\b/.test(raw) && diff === 0) diff = 7;
    const d = new Date(today);
    d.setDate(d.getDate() + diff);
    return isoDateLocal(d);
  }

  return null;
}

function extractResponseText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts: string[] = [];
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function emptyParsed(action: AssistantAction, command: string): ParsedCommand {
  return {
    action,
    confidence: action === "unknown" ? 0 : 0.5,
    entity_type: "unknown",
    job_number: null,
    transport_number: null,
    customer_name: null,
    supplier_name: null,
    crane_name: null,
    operator_name: null,
    vehicle_name: null,
    quote_reference: null,
    po_reference: null,
    page_name: null,
    date_text: null,
    target_date: null,
    end_date: null,
    visit_date: null,
    status: null,
    invoice_status: null,
    site_name: null,
    site_address: null,
    collection_address: null,
    delivery_address: null,
    load_description: null,
    contact_name: null,
    phone: null,
    email: null,
    notes: null,
    amount: null,
    search_query: stripCommandNoise(command) || command,
    dangerous: false,
  };
}

function normaliseStatus(value: string | null | undefined, kind: "job" | "transport" = "job") {
  const s = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["draft", "provisional", "confirmed", "in_progress", "completed", "cancelled", "late_cancelled"].includes(s)) return s;
  if (kind === "transport" && ["planned", "confirmed", "in_progress", "completed", "cancelled", "late_cancelled"].includes(s)) return s;
  if (s === "invoiced") return "completed";
  if (s === "done") return "completed";
  if (s === "started") return "in_progress";
  return null;
}

function normaliseInvoiceStatus(value: string | null | undefined) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("part")) return "Part Paid";
  if (s.includes("paid")) return "Paid";
  if (s.includes("not") || s.includes("unpaid")) return "Not Invoiced";
  if (s.includes("invoice")) return "Invoiced";
  return null;
}

function fallbackParseCommand(input: string): ParsedCommand {
  const text = normaliseSpeechText(String(input ?? "").trim());
  const lower = text.toLowerCase();
  const parsed = emptyParsed("search", text);
  const jobMatch = lower.match(/\bjob\s*#?\s*(\d+)\b/) ?? lower.match(/\b#\s*(\d+)\b/);
  const trMatch = text.match(/\b(TR[-\s]?[A-Z0-9-]+|transport\s*(?:job)?\s*#?\s*([A-Z0-9-]+))\b/i);
  parsed.job_number = jobMatch ? Number(jobMatch[1]) : null;
  parsed.transport_number = trMatch ? String(trMatch[1] ?? trMatch[2]).replace(/\s+/g, "-").toUpperCase() : null;

  const dateBits = [
    "today",
    "tomorrow",
    "yesterday",
    "next monday",
    "next tuesday",
    "next wednesday",
    "next thursday",
    "next friday",
    "next saturday",
    "next sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  parsed.date_text = dateBits.find((bit) => lower.includes(bit)) ?? null;
  parsed.target_date = resolveDate(parsed.date_text);
  parsed.visit_date = parsed.target_date;

  if (/\b(help|what can you do|examples)\b/.test(lower)) return { ...parsed, action: "help" };

  if (/\b(open|go to|take me to|show)\b/.test(lower) && /\blift\s*plan\b|\blp\b/.test(lower) && parsed.job_number) {
    return { ...parsed, action: /\bpack|print\b/.test(lower) ? "open_lift_plan_pack" : "open_lift_plan", entity_type: "lift_plan", confidence: 0.9 };
  }
  if (/\b(open|find|show)\b/.test(lower) && parsed.job_number) return { ...parsed, action: "open_job", entity_type: "job", confidence: 0.86 };
  if (/\b(open|find|show)\b/.test(lower) && parsed.transport_number) return { ...parsed, action: "open_transport_job", entity_type: "transport_job", confidence: 0.84 };

  if (/\b(create|add|new)\b/.test(lower) && /\bcustomer\b/.test(lower)) {
    const name = text.match(/(?:customer|client)\s+(?:called|named)?\s*(.+?)(?:\s+with\s+|\s+email\s+|\s+phone\s+|$)/i)?.[1];
    return { ...parsed, action: "create_customer_draft", entity_type: "customer", customer_name: clean(name) ?? stripCommandNoise(text), confidence: 0.75 };
  }
  if (/\b(create|add|new)\b/.test(lower) && /\bsupplier|subcontractor|sub-contractor\b/.test(lower)) {
    const name = text.match(/(?:supplier|subcontractor|sub-contractor)\s+(?:called|named)?\s*(.+?)(?:\s+with\s+|\s+email\s+|\s+phone\s+|$)/i)?.[1];
    return { ...parsed, action: "create_supplier_draft", entity_type: "supplier", supplier_name: clean(name) ?? stripCommandNoise(text), confidence: 0.72 };
  }
  if (/\b(create|add|new)\b/.test(lower) && /\boperator|driver|staff\b/.test(lower)) {
    const op = text.match(/(?:operator|driver|staff)\s+(?:called|named)?\s*(.+?)(?:\s+with\s+|\s+email\s+|\s+phone\s+|$)/i)?.[1];
    return { ...parsed, action: "create_operator_draft", entity_type: "operator", operator_name: clean(op) ?? stripCommandNoise(text), confidence: 0.7 };
  }
  if (/\b(create|add|new)\b/.test(lower) && /\bcrane\b/.test(lower) && !/\bjob\b/.test(lower)) {
    const name = text.match(/crane\s+(?:called|named)?\s*(.+?)(?:\s+reg\s+|\s+registration\s+|$)/i)?.[1];
    return { ...parsed, action: "create_crane_draft", entity_type: "crane", crane_name: clean(name) ?? stripCommandNoise(text), confidence: 0.7 };
  }
  if (/\b(create|add|new)\b/.test(lower) && /\bvehicle|truck|wagon|lorry\b/.test(lower)) {
    const name = text.match(/(?:vehicle|truck|wagon|lorry)\s+(?:called|named)?\s*(.+?)(?:\s+reg\s+|\s+registration\s+|$)/i)?.[1];
    return { ...parsed, action: "create_vehicle_draft", entity_type: "vehicle", vehicle_name: clean(name) ?? stripCommandNoise(text), confidence: 0.7 };
  }

  if (/\b(create|add|new)\b/.test(lower) && /\btransport\b/.test(lower) && /\bjob\b/.test(lower)) {
    const customer = text.match(/\bfor\s+(.+?)(?:\s+on\s+|\s+tomorrow\b|\s+today\b|\s+next\s+|\s+from\s+|$)/i)?.[1];
    const from = text.match(/\bfrom\s+(.+?)(?:\s+to\s+|$)/i)?.[1];
    const to = text.match(/\bto\s+(.+?)(?:\s+with\s+|\s+on\s+|$)/i)?.[1];
    return { ...parsed, action: "create_transport_job_draft", entity_type: "transport_job", customer_name: clean(customer), collection_address: clean(from), delivery_address: clean(to), confidence: 0.74 };
  }

  if (/\b(create|add|new)\b/.test(lower) && /\b(crane|lift)\b/.test(lower) && /\bjob\b/.test(lower)) {
    const customer = text.match(/\bfor\s+(.+?)(?:\s+on\s+|\s+tomorrow\b|\s+today\b|\s+next\s+|\s+with\s+|$)/i)?.[1];
    const crane = text.match(/\bwith\s+(?:the\s+)?(.+?)(?:\s+and\s+|\s+on\s+|$)/i)?.[1];
    return { ...parsed, action: "create_crane_job_draft", entity_type: "job", customer_name: clean(customer), crane_name: clean(crane), confidence: 0.76 };
  }

  if (/\b(move|change|put|reschedule)\b/.test(lower) && parsed.job_number) return { ...parsed, action: "move_job_draft", entity_type: "job", confidence: 0.78 };
  if (/\b(move|change|put|reschedule)\b/.test(lower) && parsed.transport_number) return { ...parsed, action: "move_transport_job_draft", entity_type: "transport_job", confidence: 0.78 };

  if (/\b(add|assign|put|allocate)\b/.test(lower) && /\boperator|driver|shaun|tom|dan\b/.test(lower) && (parsed.job_number || parsed.transport_number)) {
    const op = text.match(/\b(?:add|assign|put|allocate)\s+(.+?)\s+(?:as\s+)?(?:operator|driver)?\s*(?:on|to|for)\s+(?:job|transport)/i)?.[1];
    return { ...parsed, action: "assign_operator_draft", operator_name: clean(op), entity_type: parsed.transport_number ? "transport_job" : "job", confidence: 0.72 };
  }
  if (/\b(add|assign|put|allocate)\b/.test(lower) && /\bcrane|grove|jekko|hk40|tadano|bocker\b/.test(lower) && parsed.job_number) {
    const crane = text.match(/\b(?:add|assign|put|allocate)\s+(.+?)\s+(?:crane\s+)?(?:on|to|for)\s+job/i)?.[1];
    return { ...parsed, action: "assign_crane_draft", crane_name: clean(crane) ?? stripCommandNoise(text), entity_type: "job", confidence: 0.72 };
  }
  if (/\b(add|assign|put|allocate)\b/.test(lower) && /\bvehicle|truck|wagon|lorry\b/.test(lower) && parsed.transport_number) {
    const vehicle = text.match(/\b(?:add|assign|put|allocate)\s+(.+?)\s+(?:vehicle|truck|wagon|lorry)?\s*(?:on|to|for)\s+transport/i)?.[1];
    return { ...parsed, action: "assign_vehicle_draft", vehicle_name: clean(vehicle) ?? stripCommandNoise(text), entity_type: "transport_job", confidence: 0.72 };
  }

  if (/\binvoic|paid|part paid|not invoiced\b/.test(lower) && (parsed.job_number || parsed.transport_number)) {
    const invoiceStatus = normaliseInvoiceStatus(lower) ?? "Invoiced";
    if (/\bvisit|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday\b/.test(lower) && parsed.job_number) {
      return { ...parsed, action: "mark_visit_invoiced_draft", invoice_status: invoiceStatus, entity_type: "job", confidence: 0.82 };
    }
    return { ...parsed, action: "update_invoice_status_draft", invoice_status: invoiceStatus, entity_type: parsed.transport_number ? "transport_job" : "job", confidence: 0.78 };
  }

  const status = normaliseStatus(lower, parsed.transport_number ? "transport" : "job");
  if (/\b(mark|set|change|make)\b/.test(lower) && status && (parsed.job_number || parsed.transport_number)) {
    return { ...parsed, action: parsed.transport_number ? "update_transport_status_draft" : "update_job_status_draft", status, entity_type: parsed.transport_number ? "transport_job" : "job", confidence: 0.76 };
  }

  if (/\bcancel\b/.test(lower) && (parsed.job_number || parsed.transport_number)) {
    return { ...parsed, action: "cancel_record_draft", status: lower.includes("late") ? "late_cancelled" : "cancelled", entity_type: parsed.transport_number ? "transport_job" : "job", dangerous: true, confidence: 0.82 };
  }
  if (/\barchive\b/.test(lower)) return { ...parsed, action: "archive_record_draft", dangerous: true, confidence: 0.7 };
  if (/\brestore\b/.test(lower)) return { ...parsed, action: "restore_record_draft", confidence: 0.7 };
  if (/\bunlock\b/.test(lower) && /\blift\s*plan\b/.test(lower) && parsed.job_number) return { ...parsed, action: "unlock_lift_plan_draft", entity_type: "lift_plan", dangerous: true, confidence: 0.82 };
  if (/\block\b/.test(lower) && /\blift\s*plan\b/.test(lower) && parsed.job_number) return { ...parsed, action: "lock_lift_plan_draft", entity_type: "lift_plan", dangerous: true, confidence: 0.82 };

  if (/\bmissing|ready|lift plan|lp\b/.test(lower) && parsed.job_number) return { ...parsed, action: "check_job_missing_info", entity_type: "job", confidence: 0.78 };
  if (/\b(planner|diary|calendar)\b/.test(lower)) return { ...parsed, action: "navigate", page_name: lower.includes("transport") ? "transport planner" : lower.includes("staff") ? "staff planner" : "crane planner", confidence: 0.68 };

  return parsed;
}

async function parseWithOpenAI(command: string): Promise<ParsedCommand | null> {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;

  const todayIso = currentTodayIso();
  const model = clean(process.env.OPENAI_CRM_ASSISTANT_MODEL) ?? "gpt-4.1-mini";

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: [
          "help",
          "search",
          "navigate",
          "open_job",
          "open_transport_job",
          "open_lift_plan",
          "open_lift_plan_pack",
          "open_customer",
          "open_quote",
          "check_job_missing_info",
          "create_crane_job_draft",
          "create_transport_job_draft",
          "create_customer_draft",
          "create_supplier_draft",
          "create_operator_draft",
          "create_crane_draft",
          "create_vehicle_draft",
          "move_job_draft",
          "move_transport_job_draft",
          "assign_operator_draft",
          "assign_crane_draft",
          "assign_vehicle_draft",
          "update_job_status_draft",
          "update_transport_status_draft",
          "update_invoice_status_draft",
          "mark_visit_invoiced_draft",
          "add_note_draft",
          "update_site_draft",
          "cancel_record_draft",
          "archive_record_draft",
          "restore_record_draft",
          "lock_lift_plan_draft",
          "unlock_lift_plan_draft",
          "unknown",
        ],
      },
      confidence: { type: "number" },
      entity_type: { type: "string", enum: ["job", "transport_job", "customer", "supplier", "operator", "crane", "vehicle", "quote", "purchase_order", "lift_plan", "unknown"] },
      job_number: { type: ["number", "null"] },
      transport_number: { type: ["string", "null"] },
      customer_name: { type: ["string", "null"] },
      supplier_name: { type: ["string", "null"] },
      crane_name: { type: ["string", "null"] },
      operator_name: { type: ["string", "null"] },
      vehicle_name: { type: ["string", "null"] },
      quote_reference: { type: ["string", "null"] },
      po_reference: { type: ["string", "null"] },
      page_name: { type: ["string", "null"] },
      date_text: { type: ["string", "null"] },
      target_date: { type: ["string", "null"] },
      end_date: { type: ["string", "null"] },
      visit_date: { type: ["string", "null"] },
      status: { type: ["string", "null"] },
      invoice_status: { type: ["string", "null"] },
      site_name: { type: ["string", "null"] },
      site_address: { type: ["string", "null"] },
      collection_address: { type: ["string", "null"] },
      delivery_address: { type: ["string", "null"] },
      load_description: { type: ["string", "null"] },
      contact_name: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
      email: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
      amount: { type: ["number", "null"] },
      search_query: { type: ["string", "null"] },
      dangerous: { type: "boolean" },
    },
    required: [
      "action",
      "confidence",
      "entity_type",
      "job_number",
      "transport_number",
      "customer_name",
      "supplier_name",
      "crane_name",
      "operator_name",
      "vehicle_name",
      "quote_reference",
      "po_reference",
      "page_name",
      "date_text",
      "target_date",
      "end_date",
      "visit_date",
      "status",
      "invoice_status",
      "site_name",
      "site_address",
      "collection_address",
      "delivery_address",
      "load_description",
      "contact_name",
      "phone",
      "email",
      "notes",
      "amount",
      "search_query",
      "dangerous",
    ],
  };

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are the command parser for AnnS Crane CRM. Return exactly one safe structured action. Read/navigation actions may be direct. Any change to CRM data must be a *_draft action and will require a confirmation screen. Never invent IDs. Extract names, job numbers, transport numbers, dates, statuses, invoice statuses, addresses, contact details and notes from the user command. If the command is destructive/high-risk such as cancel, archive, delete, lock/unlock lift plan, or mark paid, still return the matching draft action but set dangerous=true. Today's date is " +
              todayIso +
              ". Use ISO YYYY-MM-DD for clear date references. Prefer open_lift_plan/open_lift_plan_pack when the user asks to open a lift plan, pack or print pack.",
          },
          { role: "user", content: normaliseSpeechText(command) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "crm_command",
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const text = extractResponseText(data);
    if (!text) return null;
    const parsed = JSON.parse(text) as ParsedCommand;
    if (!parsed?.action) return null;

    const fallback = fallbackParseCommand(command);
    return {
      ...fallback,
      ...parsed,
      action: parsed.action === "unknown" ? fallback.action : parsed.action,
      job_number: parsed.job_number ?? fallback.job_number,
      transport_number: clean(parsed.transport_number) ?? fallback.transport_number,
      target_date: resolveDate(parsed.date_text, parsed.target_date) ?? fallback.target_date,
      end_date: resolveDate(parsed.end_date, parsed.end_date),
      visit_date: resolveDate(parsed.visit_date ?? parsed.date_text, parsed.visit_date) ?? fallback.visit_date,
      invoice_status: normaliseInvoiceStatus(parsed.invoice_status) ?? parsed.invoice_status,
      status: normaliseStatus(parsed.status, parsed.entity_type === "transport_job" ? "transport" : "job") ?? parsed.status,
      dangerous: Boolean(parsed.dangerous || fallback.dangerous),
    };
  } catch {
    return null;
  }
}

function responseJson(payload: Record<string, any>, status = 200) {
  return NextResponse.json({ ok: status < 400, ...payload }, { status });
}

function fromAuthEmail(email: string | null | undefined) {
  return email ? String(email).split("@")[0] : null;
}

function pageHref(name: string | null | undefined, parsed?: ParsedCommand) {
  const n = normaliseName(name);
  const date = parsed ? resolveDate(parsed.date_text, parsed.target_date) : null;
  if (!n) return null;
  if (n.includes("transport planner")) return date ? `/transport-planner?date=${encodeURIComponent(date)}` : "/transport-planner";
  if (n.includes("staff planner")) return date ? `/staff-planner?date=${encodeURIComponent(date)}` : "/staff-planner";
  if (n.includes("planner") || n.includes("crane planner") || n.includes("diary")) return date ? `/planner?date=${encodeURIComponent(date)}` : "/planner";
  if (n.includes("transport map") || n.includes("map")) return "/transport-map";
  if (n.includes("outstanding invoice") || n.includes("invoice")) return "/invoices/outstanding";
  if (n.includes("customer")) return "/customers";
  if (n.includes("job")) return "/jobs";
  if (n.includes("transport job")) return "/transport-jobs";
  if (n.includes("quote")) return "/quotes";
  if (n.includes("purchase order") || n.includes("po")) return "/purchase-orders";
  if (n.includes("supplier") || n.includes("subcontractor")) return "/suppliers";
  if (n.includes("operator")) return "/operators";
  if (n.includes("crane")) return "/cranes";
  if (n.includes("vehicle") || n.includes("truck")) return "/vehicles";
  if (n.includes("asset availability") || n.includes("downtime") || n.includes("maintenance") || n.includes("mot") || n.includes("service booking") || n.includes("breakdown")) return "/asset-availability";
  if (n.includes("asset location")) return "/equipment/locations";
  if (n.includes("asset")) return "/equipment/locations";
  if (n.includes("system health")) return "/settings/system-health";
  if (n.includes("settings")) return "/settings";
  if (n.includes("dashboard")) return "/dashboard";
  if (n.includes("sales")) return "/sales-hub";
  return null;
}

async function resolveCustomer(supabase: any, name: string | null | undefined): Promise<ResolveResult> {
  const wanted = clean(name);
  if (!wanted) return { selected: null, matches: [], score: 0, warning: null };
  const { data } = await supabase.from("clients").select("id, company_name, contact_name, phone, email, archived").or("archived.is.null,archived.eq.false").order("company_name", { ascending: true }).limit(500);
  return rankMatches(data ?? [], wanted, (row: any) => `${row.company_name ?? ""} ${row.contact_name ?? ""}`);
}

async function resolveSupplier(supabase: any, name: string | null | undefined): Promise<ResolveResult> {
  const wanted = clean(name);
  if (!wanted) return { selected: null, matches: [], score: 0, warning: null };
  const { data } = await supabase.from("suppliers").select("id, company_name, contact_name, phone, email, archived, status").or("archived.is.null,archived.eq.false").order("company_name", { ascending: true }).limit(500);
  return rankMatches(data ?? [], wanted, (row: any) => `${row.company_name ?? ""} ${row.contact_name ?? ""}`);
}

async function resolveCrane(supabase: any, name: string | null | undefined): Promise<ResolveResult> {
  const wanted = clean(name);
  if (!wanted) return { selected: null, matches: [], score: 0, warning: null };
  const { data } = await supabase.from("cranes").select("id, name, reg_number, fleet_number, status, archived").or("archived.is.null,archived.eq.false").order("name", { ascending: true }).limit(500);
  return rankMatches(data ?? [], wanted, (row: any) => `${row.name ?? ""} ${row.reg_number ?? ""} ${row.fleet_number ?? ""}`);
}

async function resolveOperator(supabase: any, name: string | null | undefined): Promise<ResolveResult> {
  const wanted = clean(name);
  if (!wanted) return { selected: null, matches: [], score: 0, warning: null };
  const { data } = await supabase.from("operators").select("id, full_name, email, phone, status, archived").or("archived.is.null,archived.eq.false").order("full_name", { ascending: true }).limit(500);
  return rankMatches(data ?? [], wanted, (row: any) => `${row.full_name ?? ""} ${row.email ?? ""} ${row.phone ?? ""}`);
}

async function resolveVehicle(supabase: any, name: string | null | undefined): Promise<ResolveResult> {
  const wanted = clean(name);
  if (!wanted) return { selected: null, matches: [], score: 0, warning: null };
  const { data } = await supabase.from("vehicles").select("id, name, reg_number, vehicle_type, status, archived").or("archived.is.null,archived.eq.false").order("name", { ascending: true }).limit(500);
  return rankMatches(data ?? [], wanted, (row: any) => `${row.name ?? ""} ${row.reg_number ?? ""} ${row.vehicle_type ?? ""}`);
}

async function findJobByNumber(supabase: any, jobNumber: number | null | undefined) {
  const n = numberOrNull(jobNumber);
  if (n == null) return null;
  const { data } = await supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      client_id,
      operator_id,
      crane_id,
      site_name,
      site_address,
      job_date,
      start_date,
      end_date,
      start_time,
      end_time,
      status,
      invoice_status,
      hire_type,
      lift_type,
      notes,
      archived,
      clients:client_id (id, company_name),
      operators:operator_id (id, full_name),
      cranes:crane_id (id, name, reg_number)
    `)
    .eq("job_number", n)
    .maybeSingle();
  return data ?? null;
}

async function findTransportByNumber(supabase: any, ref: string | null | undefined) {
  const raw = clean(ref);
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, "-").toUpperCase();
  const { data } = await supabase
    .from("transport_jobs")
    .select(`
      id,
      transport_number,
      client_id,
      vehicle_id,
      operator_id,
      collection_address,
      delivery_address,
      transport_date,
      delivery_date,
      collection_time,
      delivery_time,
      status,
      invoice_status,
      load_description,
      notes,
      archived,
      clients:client_id (id, company_name),
      vehicles:vehicle_id (id, name, reg_number),
      operators:operator_id (id, full_name)
    `)
    .ilike("transport_number", safeLike(compact))
    .order("created_at", { ascending: false })
    .limit(1);
  return (data ?? [])[0] ?? null;
}

function jobResult(job: any): AssistantResult {
  const client = first(job?.clients);
  return {
    label: `Job ${job?.job_number ?? "—"}`,
    href: `/jobs/${job?.id}`,
    badge: String(job?.status ?? "Job"),
    description: `${client?.company_name ?? "No customer"} • ${job?.site_name ?? job?.site_address ?? "No site"} • ${formatDate(job?.start_date ?? job?.job_date)}`,
  };
}

function transportResult(job: any): AssistantResult {
  const client = first(job?.clients);
  return {
    label: `${job?.transport_number ?? "Transport job"}`,
    href: `/transport-jobs/${job?.id}`,
    badge: String(job?.status ?? "transport"),
    description: `${client?.company_name ?? "No customer"} • ${job?.collection_address ?? "Collection?"} → ${job?.delivery_address ?? "Delivery?"} • ${formatDate(job?.transport_date)}`,
  };
}

type SupportTopic = {
  id: string;
  title: string;
  keywords: string[];
  message: string;
  results?: AssistantResult[];
};

const SUPPORT_TOPICS: SupportTopic[] = [
  {
    id: "assistant_use",
    title: "How to use the CRM Assistant",
    keywords: ["assistant", "help", "what can you do", "examples", "ask", "question", "command", "talk", "voice"],
    message:
      "The CRM Assistant can answer normal CRM questions, explain where to click, find/open jobs and transport jobs, and prepare some changes behind a Confirm screen. For staff support, ask it in plain English. If it says a change is risky or needs manager approval, do not carry on guessing.",
    results: [
      { label: "Open dashboard", href: "/dashboard", badge: "start", description: "Use the dashboard as the safest starting point." },
    ],
  },
  {
    id: "dashboard_search",
    title: "Dashboard / search / finding things",
    keywords: ["dashboard", "search", "find", "where is", "can't find", "cant find", "look up", "filter", "list", "open page", "menu"],
    message:
      "Use the dashboard for day-to-day actions and the search/jobs lists to find records. Search by job number, transport number, customer, site, collection address or delivery address. If you cannot find something, check filters/date/status before creating a duplicate record.",
    results: [
      { label: "Open dashboard", href: "/dashboard", badge: "dashboard", description: "Main CRM start page." },
      { label: "Open jobs", href: "/jobs", badge: "jobs", description: "Crane jobs list with filters." },
      { label: "Open transport jobs", href: "/transport-jobs", badge: "transport", description: "Transport jobs list with filters." },
    ],
  },
  {
    id: "jobs",
    title: "Crane jobs",
    keywords: ["crane job", "job page", "job details", "job status", "operator", "crane allocation", "site", "customer", "late cancelled", "late-cancelled", "duplicate job", "recurring job"],
    message:
      "Crane jobs are managed from Jobs. Check customer, site, date/time, crane/equipment, operator/labour, hire type, price, invoice status, documents and lift plan. Do not change a job status just to make it appear somewhere. Late-cancelled jobs may still show on planners because they can still need tracking/invoicing.",
    results: [
      { label: "Open jobs", href: "/jobs", badge: "jobs", description: "Crane jobs and filters." },
      { label: "Open crane planner", href: "/planner", badge: "planner", description: "Crane planner view." },
    ],
  },
  {
    id: "transport",
    title: "Transport jobs",
    keywords: ["transport", "transport job", "haulage", "hiab", "vehicle", "driver", "movement order", "escort", "police", "self escort", "delivery", "collection", "route", "abnormal load"],
    message:
      "Transport jobs live under Transport Jobs and Transport Planner, not the crane planner. Check collection/delivery dates and times, vehicle, driver/operator, price, invoice status, documents, movement order, self escort and police escort fields. If movement order or escort is required, those details should remain visible after saving.",
    results: [
      { label: "Open transport jobs", href: "/transport-jobs", badge: "transport", description: "Search and filter transport jobs." },
      { label: "Open transport planner", href: "/transport-planner", badge: "planner", description: "Vehicle/day view for transport work." },
      { label: "Open transport map", href: "/transport-map", badge: "map", description: "Route/map view where available." },
    ],
  },
  {
    id: "planner",
    title: "Planners / jobs not showing",
    keywords: ["planner", "calendar", "diary", "not showing", "disappeared", "missing from planner", "move job", "drag", "drop", "availability", "free", "booked", "today", "this week"],
    message:
      "For planner issues, first check the correct planner, date/week and filters. Crane jobs show on the crane planner; transport jobs show on the transport planner. Late-cancelled jobs should still show. If a job has disappeared, search the job/transport number first and do not change the status just to force it onto the planner.",
    results: [
      { label: "Open crane planner", href: "/planner", badge: "planner", description: "Crane jobs and crane allocations." },
      { label: "Open transport planner", href: "/transport-planner", badge: "planner", description: "Transport jobs and vehicle allocations." },
      { label: "Open staff planner", href: "/staff-planner", badge: "staff", description: "Staff holidays/availability and allocations." },
    ],
  },
  {
    id: "hire_agreement",
    title: "Hire agreements / printing",
    keywords: ["hire agreement", "agreement", "cpa", "rha", "contract lift", "terms", "print", "pdf", "save as pdf", "blank page", "blank pages", "filename", "file name", "mac", "safari"],
    message:
      "Hire agreements are generated from the job or transport job hire-agreement page. Check customer/site or collection/delivery details, hire type, supply description and rates before printing. For transport, use RHA/transport terms where appropriate. If the print preview looks wrong, refresh the hire agreement page and try Print / Save as PDF again. Do not edit job details just to fix a printing issue.",
    results: [
      { label: "Open jobs", href: "/jobs", badge: "crane", description: "Open a crane job then use its hire agreement page." },
      { label: "Open transport jobs", href: "/transport-jobs", badge: "transport", description: "Open a transport job then use its hire agreement page." },
    ],
  },
  {
    id: "documents",
    title: "Documents / uploads",
    keywords: ["document", "upload", "file", "attachment", "photo", "image", "spec sheet", "load chart", "certificate", "pdf", "download", "preview"],
    message:
      "For job documents, open the job or transport job and use the documents/upload area. If an upload appears to error but the file shows when you go back, do not upload it again repeatedly because duplicates may be created. Refresh the job page first, then check documents. If a document is missing, note the job number, filename and time.",
    results: [
      { label: "Open jobs", href: "/jobs", badge: "documents", description: "Open the relevant crane job record first." },
      { label: "Open transport jobs", href: "/transport-jobs", badge: "documents", description: "Open the relevant transport job record first." },
      { label: "Open cranes", href: "/cranes", badge: "specs", description: "Crane spec sheets/load charts are usually attached to crane records." },
    ],
  },
  {
    id: "holidays",
    title: "Staff holidays",
    keywords: ["holiday", "holidays", "annual leave", "bank holiday", "unpaid", "entitlement", "28 days", "leave", "staff planner", "absence", "sick", "working days", "6 april", "5 april"],
    message:
      "Holiday entitlement is 28 days including bank holidays. The holiday year runs from 6 April to 5 April. Weekends should not count as used days. Bank holidays are included in the 28-day allowance. If a booking takes someone over their allowance, the CRM should warn how many days are unpaid. Subcontractors should not be entitlement-tracked like employees.",
    results: [
      { label: "Open staff planner", href: "/staff-planner", badge: "holidays", description: "View/book staff availability and holidays." },
    ],
  },
  {
    id: "loler",
    title: "LOLER inspections",
    keywords: ["loler", "inspection", "certificate", "inspected", "done", "passed", "crane inspection", "next due", "report ref", "inspection run"],
    message:
      "LOLER runs can span several days and not every crane is inspected at once. Planner badges should show across the inspection window. Use the LOLER inspection area to mark each crane completed/passed and record completed date, certificate/report ref, next due date and notes. Only block assignment if that crane must not be booked while inspected.",
    results: [
      { label: "Open crane planner", href: "/planner", badge: "LOLER", description: "LOLER badges appear on crane planner days." },
      { label: "Open cranes", href: "/cranes", badge: "cranes", description: "Check crane records and LOLER due dates." },
    ],
  },
  {
    id: "lift_plan",
    title: "Lift plans / range chart / appointed person checks",
    keywords: ["lift plan", "method statement", "risk assessment", "range chart", "ground bearing", "mat", "mats", "outrigger", "appointed person", "contract lift", "boom", "jib", "radius", "accessories", "crane setup", "load chart", "pack", "add crane", "select crane", "choose crane", "extra crane", "alternative crane"],
    message:
      "For contract lifts, open the job and then the lift plan. To add/select a crane on a lift plan, first check the crane is selected on the job/allocation, then open the Lift Plan page and use the selected crane/crane section to choose the crane from the dropdown. If the crane is not available, check job allocation/equipment first rather than creating a new crane record. For an extra/alternative crane option, use the additional crane/options area and keep each crane option separate. The range chart is a planning aid only and must be checked by the appointed person against the correct manufacturer chart/spec sheet before approval. Do not unlock or approve a lift plan unless authorised.",
    results: [
      { label: "Open jobs", href: "/jobs", badge: "lift plan", description: "Open the job then select Lift Plan." },
      { label: "Open crane documents", href: "/cranes", badge: "specs", description: "Use crane records for spec sheets/load charts." },
    ],
  },
  {
    id: "invoice",
    title: "Invoices / visit invoicing / payments",
    keywords: ["invoice", "invoiced", "paid", "part paid", "visit invoiced", "undo visit", "outstanding", "not invoiced", "payment", "vat", "amount paid", "completed not invoiced"],
    message:
      "Invoice status is separate from job status. Visit invoicing marks individual planner visits; full-job invoice status marks the whole job. For multi-day jobs, be careful not to mark every visit if only one visit should be invoiced. Late-cancelled jobs can still be invoiceable where applicable. If unsure, check the job page and dashboard/outstanding invoices before changing statuses.",
    results: [
      { label: "Open dashboard", href: "/dashboard", badge: "finance", description: "Outstanding invoices and action cards." },
      { label: "Open jobs", href: "/jobs", badge: "jobs", description: "Use filters for status/invoice state." },
      { label: "Open transport jobs", href: "/transport-jobs", badge: "transport", description: "Transport invoice status is handled on transport jobs." },
    ],
  },
  {
    id: "customers_quotes",
    title: "Customers / quotes / follow-ups",
    keywords: ["customer", "client", "contact", "quote", "quotation", "follow up", "email customer", "phone", "address", "site contact", "order"],
    message:
      "Customers and quotes should be checked before creating duplicates. Search by company name, contact, email, postcode or job reference. For quote follow-ups, open Quotes or Sales Hub. Do not overwrite customer contact details unless you are sure the new details are correct.",
    results: [
      { label: "Open customers", href: "/customers", badge: "customers", description: "Customer records and contacts." },
      { label: "Open quotes", href: "/quotes", badge: "quotes", description: "Quote list and follow-ups." },
      { label: "Open Sales Hub", href: "/sales-hub", badge: "sales", description: "Sales follow-up tools." },
    ],
  },
  {
    id: "suppliers_pos",
    title: "Suppliers / subcontractors / purchase orders",
    keywords: ["supplier", "subcontractor", "sub contractor", "cross hire", "purchase order", "po", "cost", "supplier cost", "external crane", "subbie"],
    message:
      "Suppliers/subcontractors are managed separately from operators and should not need normal CRM logins. Purchase orders and supplier costs should be checked carefully before saving. If adding multiple suppliers to a job, keep each supplier/cost/description separate so finance can understand what was used.",
    results: [
      { label: "Open suppliers", href: "/suppliers", badge: "suppliers", description: "Supplier/subcontractor records." },
      { label: "Open purchase orders", href: "/purchase-orders", badge: "PO", description: "Purchase orders and supplier costs." },
    ],
  },
  {
    id: "assets",
    title: "Cranes / vehicles / assets / downtime",
    keywords: ["crane", "vehicle", "asset", "fleet", "reg", "registration", "maintenance", "downtime", "mot", "service", "repair", "breakdown", "unavailable", "location", "what3words", "asset location"],
    message:
      "Cranes and vehicles are managed from their asset records. Use downtime/availability where a crane or vehicle is unavailable for maintenance, MOT, service, inspection, repair or breakdown. Do not delete an asset just because it is unavailable; mark it correctly or add downtime instead.",
    results: [
      { label: "Open cranes", href: "/cranes", badge: "cranes", description: "Crane records, documents and LOLER dates." },
      { label: "Open vehicles", href: "/vehicles", badge: "vehicles", description: "Vehicle records and details." },
      { label: "Open asset availability", href: "/asset-availability", badge: "downtime", description: "Maintenance/downtime bookings." },
      { label: "Open asset locations", href: "/equipment/locations", badge: "locations", description: "Where assets are currently recorded." },
    ],
  },
  {
    id: "sales",
    title: "Sales Hub / campaigns",
    keywords: ["sales hub", "campaign", "email", "outreach", "lead", "quote follow up", "dormant", "unsubscribe", "suppression", "marketing", "test mode", "availability notice"],
    message:
      "Use Sales Hub for lead follow-up, quote follow-up, dormant customer recovery and availability notices. Marketing/campaign emails must include unsubscribe/removal wording or link, and suppressed/do-not-contact contacts must be skipped. If sending looks blocked or restricted, do not keep sending repeatedly.",
    results: [
      { label: "Open Sales Hub", href: "/sales-hub", badge: "sales", description: "Campaigns, leads and outreach tools." },
      { label: "Open quotes", href: "/quotes", badge: "quotes", description: "Quote follow-up starts from quotes/customers." },
    ],
  },
  {
    id: "errors",
    title: "Errors / something looks wrong",
    keywords: ["error", "problem", "not working", "broken", "wrong", "stuck", "failed", "won't save", "wont save", "can't save", "cant save", "loading", "blank", "crashed", "500"],
    message:
      "If something looks wrong, do not guess or bulk-edit. Refresh once, check you are on the correct record/page, and note the job number, customer, page and rough time. If it still looks wrong, leave the record alone and report it clearly. Repeated edits can make it harder to fix later.",
    results: [
      { label: "Open dashboard", href: "/dashboard", badge: "dashboard", description: "Start here for current operational checks." },
    ],
  },
  {
    id: "changes",
    title: "Recent changes / audit trail",
    keywords: ["changed", "who changed", "history", "audit", "recent changes", "what changed", "before", "after", "deleted", "missing", "status changed", "wrong status"],
    message:
      "If something has changed unexpectedly, do not try lots of fixes. Note the record/job number and rough time. The CRM records recent changes so Tom can compare what it was before and what it changed to. Staff should not use technical screens unless they normally have access.",
    results: [
      { label: "Open dashboard", href: "/dashboard", badge: "dashboard", description: "Start here and note the affected job/customer." },
    ],
  },
  {
    id: "safe_working",
    title: "Safe working while Tom is away",
    keywords: ["tom away", "holiday", "while tom is away", "not sure", "unsure", "should i", "can this wait", "what should i do", "urgent", "emergency"],
    message:
      "Use the CRM as normal for everyday work. If unsure, ask the CRM Assistant first. Do not delete records, bulk change statuses, change invoice status, unlock lift plans or repeatedly re-upload documents unless you are sure. Write down the job/customer/page and leave it for Tom/admin if still unsure.",
    results: [
      { label: "Open dashboard", href: "/dashboard", badge: "start", description: "Start from the dashboard and avoid risky changes." },
    ],
  },
];

function helpResponse() {
  return responseJson({
    mode: "help",
    title: "AnnS CRM Assistant",
    message:
      "Ask me CRM questions or simple commands. I can explain how to use the CRM, find/open records, check jobs, and prepare changes behind a Confirm screen. If something is risky, stop and ask before changing it.",
    examples: [
      "How do I upload a transport document?",
      "Why is a job not showing on the planner?",
      "How do staff holidays work?",
      "How do I print a hire agreement?",
      "How do I mark a LOLER inspection done?",
      "Find job 169",
      "Find transport job TR-20260602-1259",
      "Show jobs needing lift plans this week",
      "Open the lift plan for job 169",
    ],
  });
}

function supportKeywords(command: string) {
  const lower = normaliseName(command);
  const matches = SUPPORT_TOPICS
    .map((topic) => ({ topic, score: topic.keywords.reduce((score, keyword) => score + (lower.includes(normaliseName(keyword)) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.topic);
  return matches;
}

function isLikelySupportQuestion(command: string) {
  const text = String(command ?? "").trim();
  const lower = text.toLowerCase();
  if (!text) return false;

  const hasQuestionLead = /^(how|why|what|where|when|can|could|should|does|do|is|are|i need help|help me|help with)\b/.test(lower) || /[?]$/.test(text);
  if (hasQuestionLead) return true;

  const crmDomainWords = /\b(job|jobs|transport|planner|diary|calendar|lift\s*plan|range\s*chart|hire\s*agreement|agreement|document|upload|invoice|holiday|staff|loler|inspection|customer|quote|supplier|subcontractor|purchase\s*order|po|crane|vehicle|asset|sales\s*hub|campaign|route|movement\s*order|escort|operator|driver|dashboard|search|print|pdf)\b/.test(lower);
  const issueWords = /\b(error|issue|problem|not working|not showing|disappeared|missing|blank page|blank pages|blank|confused|stuck|failed|wrong|broken|won't|wont|can't|cant|help with|how to|unsure|not sure)\b/.test(lower);

  // Direct record-opening/search commands should remain actions.
  if (/^(can you|could you|please)?\s*(find|open|show|search)\b/.test(lower) && /(\bjob\s*#?\s*\d+\b|\bTR[-\s]?[A-Z0-9-]+\b|\btransport\s*(?:job)?\s*#?\s*[A-Z0-9-]+\b)/i.test(text)) return false;

  // Clear write commands with a target record should remain confirmation/draft actions.
  const explicitWriteLead = /^(can you|could you|please)?\s*(create|move|assign|mark|set|cancel|archive|restore|lock|unlock|add\s+note|change\s+status|mark\s+.*invoiced)\b/.test(lower);
  const hasTargetRecord = /(\bjob\s*#?\s*\d+\b|\bTR[-\s]?[A-Z0-9-]+\b|\btransport\s*(?:job)?\s*#?\s*[A-Z0-9-]+\b)/i.test(text);
  const clearCreateJob = /^\s*(create|new|add)\s+(?:a\s+)?(?:crane\s+)?job\b/.test(lower) || /^\s*(create|new|add)\s+(?:a\s+)?transport\s+job\b/.test(lower);
  const clearCreateRecord = /^\s*(create|new|add)\s+(?:a\s+)?(?:customer|client|supplier|subcontractor|operator|driver|vehicle|crane)\s+(?:called|named|record\b)/.test(lower);
  if ((explicitWriteLead && hasTargetRecord) || clearCreateJob || clearCreateRecord) return false;

  // Staff often write short phrases like "add a crane onto a lift plan".
  // Treat CRM workflow phrases as help unless they clearly identify a record/action target.
  if (crmDomainWords && (issueWords || /\b(add|put|select|choose|change|swap|remove|print|upload|book|edit|delete|mark|set|create|move|assign|open|find|show|check)\b/.test(lower))) return true;
  if (/\b(?:onto|on to|to|from|for)\s+(?:a\s+|the\s+)?(?:lift\s*plan|planner|job|transport|invoice|holiday|document)\b/.test(lower) && !hasTargetRecord) return true;

  return false;
}

async function answerSupportWithOpenAI(command: string, matchedTopics: SupportTopic[]) {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;
  const model = clean(process.env.OPENAI_CRM_ASSISTANT_MODEL) ?? "gpt-4.1-mini";
  const guide = matchedTopics.length ? matchedTopics : SUPPORT_TOPICS;

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are the built-in AnnS Crane CRM holiday support assistant for office staff. Answer almost any CRM-use question clearly and safely in staff-friendly language. Use only the CRM guide provided and general CRM navigation common sense. Do not mention developer/admin-only systems such as deploys, Vercel, GitHub, Supabase, SQL, database table names, code files, logs, environment variables, or API routes. Do not invent facts, prices, IDs, or policy. Do not perform changes. If the question is unclear, give the most likely steps and say what information to check, such as job number, transport number, customer, page, date or status. For risky actions such as deleting, cancelling, changing invoice status, changing job status, unlocking lift plans, or bulk edits, tell staff to stop, check the record, and get manager confirmation. Keep answers short and practical. If something seems technical, tell them to note the job/page/time and ask Tom, not to try technical fixes.",
          },
          {
            role: "user",
            content: `Question: ${command}

CRM guide:
${guide.map((topic) => `- ${topic.title}: ${topic.message}`).join("\n")}`,
          },
        ],
        max_output_tokens: 450,
      }),
    });
    const data = await res.json().catch(() => null);
    const answer = clean(extractResponseText(data));
    return answer;
  } catch {
    return null;
  }
}

async function handleSupportQuestion(command: string) {
  const matched = supportKeywords(command);
  const primary = matched[0] ?? null;
  const answer = await answerSupportWithOpenAI(command, matched.slice(0, 4));
  const message =
    answer ??
    primary?.message ??
    "I can help with CRM workflow questions, finding records, planners, transport jobs, hire agreements, staff holidays, LOLER, documents, invoices and recent changes. If the question involves deleting, cancelling, invoice status, job status or unlocking a lift plan, stop and get manager confirmation before changing anything.";

  const combinedResults: AssistantResult[] = [];
  for (const topic of matched.slice(0, 3)) {
    for (const result of topic.results ?? []) {
      if (!combinedResults.some((existing) => existing.href === result.href && existing.label === result.label)) combinedResults.push(result);
    }
  }

  return responseJson({
    mode: "support",
    action: "help",
    title: primary?.title ?? "CRM help",
    message,
    results: combinedResults.slice(0, 6),
    examples: matched.length
      ? []
      : [
          "How do I find a transport job?",
          "Why is a job not showing on the planner?",
          "How do I print a hire agreement?",
          "How do staff holidays work?",
          "How do I check recent changes?",
        ],
  });
}

function liftPlanLikelyRequired(job: any) {
  const hireType = String(job?.hire_type ?? "").toLowerCase();
  const liftType = String(job?.lift_type ?? "").toLowerCase();
  return hireType.includes("contract") || liftType.includes("contract");
}

function draftResponse(draft: DraftAction, message = "I have prepared this change. Check it, then confirm to save it.", results?: AssistantResult[]) {
  return responseJson({
    mode: "draft",
    action: draft.type,
    title: draft.title,
    message,
    draftAction: draft,
    results: results ?? [],
  });
}

function needMore(title: string, message: string, results?: AssistantResult[]) {
  return responseJson({ mode: "needs_more_info", title, message, results: results ?? [] });
}

async function handleSearch(supabase: any, parsed: ParsedCommand, command: string) {
  const lower = String(command ?? "").toLowerCase();
  if (/(lift\s*plan|\blp\b)/.test(lower) && /(need|missing|required|review|show|check)/.test(lower)) {
    return handleJobsNeedingLiftPlans(supabase, command);
  }

  const query = clean(parsed.search_query) ?? clean(parsed.customer_name) ?? stripCommandNoise(command) ?? command;
  const results = await runGlobalSearch(supabase, query, "all", 10);
  return responseJson({
    mode: "read",
    action: parsed.action,
    title: `Search: ${query}`,
    message: results.flat.length ? `I found ${results.flat.length} result${results.flat.length === 1 ? "" : "s"}.` : "I could not find anything matching that.",
    results: results.flat.slice(0, 10).map((item) => ({ label: item.title, href: item.href, badge: item.type, description: item.subtitle })),
  });
}

async function handleJobsNeedingLiftPlans(supabase: any, command: string) {
  const bounds = weekBoundsFromCommand(command);
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(`id, job_number, client_id, site_name, site_address, job_date, start_date, end_date, status, hire_type, lift_type, archived, clients:client_id (id, company_name)`)
    .or("archived.is.null,archived.eq.false")
    .order("start_date", { ascending: true })
    .limit(160);
  if (error) throw new Error(error.message);

  const activeJobs = (jobs ?? []).filter((job: any) => {
    const status = String(job?.status ?? "").toLowerCase();
    if (["cancelled", "late_cancelled", "draft"].includes(status)) return false;
    const start = clean(job.start_date) ?? clean(job.job_date);
    const end = clean(job.end_date) ?? start;
    if (!start || !end) return false;
    if (end < bounds.start || start > bounds.end) return false;
    return liftPlanLikelyRequired(job);
  });

  const jobIds = activeJobs.map((job: any) => job.id).filter(Boolean);
  const { data: liftPlans, error: liftError } = jobIds.length
    ? await supabase.from("lift_plans").select("job_id, paperwork_locked").in("job_id", jobIds)
    : { data: [], error: null };
  if (liftError) throw new Error(liftError.message);
  const liftPlanByJobId = new Map((liftPlans ?? []).map((row: any) => [String(row.job_id), row]));
  const needing = activeJobs.filter((job: any) => {
    const liftPlan = liftPlanByJobId.get(String(job.id));
    return !liftPlan || !Boolean((liftPlan as any)?.paperwork_locked);
  });

  return responseJson({
    mode: "read",
    action: "search",
    title: `Jobs needing lift plans ${formatDate(bounds.start)} → ${formatDate(bounds.end)}`,
    message: needing.length ? `I found ${needing.length} job${needing.length === 1 ? "" : "s"} that may need lift plan attention.` : "I could not find any contract-lift jobs needing lift plan attention for that week.",
    results: needing.slice(0, 16).map(jobResult),
  });
}

async function handleNavigate(parsed: ParsedCommand) {
  const href = pageHref(parsed.page_name ?? parsed.search_query, parsed);
  if (!href) return responseJson({ mode: "read", title: "Where do you want to go?", message: "I could not work out the CRM page. Try saying open jobs, crane planner, transport planner, customers, invoices, system health, etc." });
  return responseJson({
    mode: "read",
    action: "navigate",
    title: "Open page",
    message: "I found the page.",
    open_href: href,
    results: [{ label: `Open ${parsed.page_name ?? "page"}`, href, badge: "page", description: href }],
  });
}

async function handleOpenJob(supabase: any, parsed: ParsedCommand, destination: "job" | "lift_plan" | "pack" = "job") {
  const job = await findJobByNumber(supabase, parsed.job_number);
  if (!job) return needMore("Job not found", parsed.job_number ? `I could not find job ${parsed.job_number}.` : "Tell me the job number to open.");
  const href = destination === "lift_plan" ? `/jobs/${job.id}/lift-plan` : destination === "pack" ? `/jobs/${job.id}/lift-plan/pack` : `/jobs/${job.id}`;
  return responseJson({
    mode: "read",
    action: destination === "job" ? "open_job" : "open_lift_plan",
    title: destination === "pack" ? `Open lift plan pack for job ${job.job_number}` : destination === "lift_plan" ? `Open lift plan for job ${job.job_number}` : `Open job ${job.job_number}`,
    message: "I found it.",
    results: [{ ...jobResult(job), href, label: destination === "pack" ? `Lift plan pack — job ${job.job_number}` : destination === "lift_plan" ? `Lift plan — job ${job.job_number}` : `Job ${job.job_number}` }],
    open_href: href,
  });
}

async function handleOpenTransportJob(supabase: any, parsed: ParsedCommand) {
  const job = await findTransportByNumber(supabase, parsed.transport_number);
  if (!job) return needMore("Transport job not found", parsed.transport_number ? `I could not find ${parsed.transport_number}.` : "Tell me the transport job number to open.");
  return responseJson({ mode: "read", action: "open_transport_job", title: `Open ${job.transport_number}`, message: "I found it.", results: [transportResult(job)], open_href: `/transport-jobs/${job.id}` });
}

async function handleOpenCustomer(supabase: any, parsed: ParsedCommand) {
  const customer = await resolveCustomer(supabase, parsed.customer_name ?? parsed.search_query);
  if (!customer.selected) return needMore("Customer not found", "I could not confidently match that customer.", customer.matches.map((row: any) => ({ label: row.company_name, href: `/customers/${row.id}`, badge: "customer", description: row.phone ?? row.email ?? "" })));
  return responseJson({ mode: "read", action: "open_customer", title: `Open ${customer.selected.company_name}`, message: customer.warning ?? "I found the customer.", results: [{ label: customer.selected.company_name, href: `/customers/${customer.selected.id}`, badge: "customer", description: customer.selected.phone ?? customer.selected.email ?? "" }], open_href: `/customers/${customer.selected.id}` });
}

async function handleMissingInfo(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  if (!job) return needMore("Job not found", parsed.job_number ? `I could not find job ${parsed.job_number}.` : "Tell me the job number to check.");

  const [{ data: equipmentRows }, { data: liftPlans }] = await Promise.all([
    supabase.from("job_equipment").select("id, asset_type, crane_id, operator_id, item_name, cranes:crane_id (id, name), operators:operator_id (id, full_name)").eq("job_id", job.id),
    supabase.from("lift_plans").select("id, paperwork_locked, method_statement, risk_assessment, pack_sections").eq("job_id", job.id).limit(1),
  ]);

  const client = first(job.clients);
  const missing: string[] = [];
  const warnings: string[] = [];
  const done: string[] = [];

  if (client?.company_name) done.push("Customer added"); else missing.push("Customer missing");
  if (job.site_name || job.site_address) done.push("Site details added"); else missing.push("Site name/address missing");
  if (job.start_date || job.job_date) done.push("Job date added"); else missing.push("Job date missing");
  if (job.start_time) done.push("Start time added"); else warnings.push("Start time not set");

  const hasCrane = Boolean(job.crane_id || (equipmentRows ?? []).some((row: any) => row.crane_id || String(row.asset_type ?? "") === "crane"));
  const hasOperator = Boolean(job.operator_id || (equipmentRows ?? []).some((row: any) => row.operator_id));
  if (hasCrane) done.push("Crane/allocation added"); else warnings.push("No crane/allocation selected");
  if (hasOperator) done.push("Operator/labour allocation added"); else warnings.push("No operator/labour allocation selected");

  if (liftPlanLikelyRequired(job)) {
    const liftPlan = (liftPlans ?? [])[0] ?? null;
    if (!liftPlan) missing.push("Contract lift appears to need a lift plan");
    else if (liftPlan.paperwork_locked) done.push("Lift plan locked");
    else warnings.push("Lift plan is not locked yet");
  }

  return responseJson({ mode: "read", action: parsed.action, title: `Job ${job.job_number} check`, message: missing.length === 0 && warnings.length === 0 ? "This job looks ready from the basic checks." : "Here is what I found.", results: [jobResult(job)], checklist: { missing, warnings, done } });
}

function simpleCreateDraft(type: string, title: string, payload: Record<string, any>, preview: DraftPreviewRow[], warning?: string | null, risk: RiskLevel = "medium") {
  const draft: DraftAction = { type, title, risk, warning: warning ?? null, preview, payload };
  return draftResponse(draft);
}

async function handleCreateCustomerDraft(parsed: ParsedCommand) {
  const name = clean(parsed.customer_name ?? parsed.search_query);
  if (!name) return needMore("Customer name needed", "Tell me the customer/company name to create.");
  return simpleCreateDraft("create_customer", "Create customer", { company_name: name, contact_name: clean(parsed.contact_name), phone: clean(parsed.phone), email: clean(parsed.email), notes: clean(parsed.notes) }, [
    { label: "Company", value: name },
    { label: "Contact", value: clean(parsed.contact_name) ?? "—" },
    { label: "Phone", value: clean(parsed.phone) ?? "—" },
    { label: "Email", value: clean(parsed.email) ?? "—" },
  ]);
}

async function handleCreateSupplierDraft(parsed: ParsedCommand) {
  const name = clean(parsed.supplier_name ?? parsed.search_query);
  if (!name) return needMore("Supplier name needed", "Tell me the supplier/sub-contractor name to create.");
  return simpleCreateDraft("create_supplier", "Create supplier/sub-contractor", { company_name: name, contact_name: clean(parsed.contact_name), phone: clean(parsed.phone), email: clean(parsed.email), notes: clean(parsed.notes), status: "active" }, [
    { label: "Company", value: name },
    { label: "Contact", value: clean(parsed.contact_name) ?? "—" },
    { label: "Phone", value: clean(parsed.phone) ?? "—" },
    { label: "Email", value: clean(parsed.email) ?? "—" },
  ]);
}

async function handleCreateOperatorDraft(parsed: ParsedCommand) {
  const name = clean(parsed.operator_name ?? parsed.search_query);
  if (!name) return needMore("Operator name needed", "Tell me the operator/staff name to create.");
  return simpleCreateDraft("create_operator", "Create operator/staff", { full_name: name, email: clean(parsed.email), phone: clean(parsed.phone), status: "active", notes: clean(parsed.notes) }, [
    { label: "Name", value: name },
    { label: "Phone", value: clean(parsed.phone) ?? "—" },
    { label: "Email", value: clean(parsed.email) ?? "—" },
  ]);
}

async function handleCreateCraneDraft(parsed: ParsedCommand) {
  const name = clean(parsed.crane_name ?? parsed.search_query);
  if (!name) return needMore("Crane name needed", "Tell me the crane name to create.");
  return simpleCreateDraft("create_crane", "Create crane", { name, reg_number: clean(parsed.notes), status: "available" }, [
    { label: "Crane", value: name },
    { label: "Status", value: "available" },
  ]);
}

async function handleCreateVehicleDraft(parsed: ParsedCommand) {
  const name = clean(parsed.vehicle_name ?? parsed.search_query);
  if (!name) return needMore("Vehicle name needed", "Tell me the vehicle name or registration to create.");
  return simpleCreateDraft("create_vehicle", "Create vehicle", { name, reg_number: clean(parsed.notes), vehicle_type: null, status: "active" }, [
    { label: "Vehicle", value: name },
    { label: "Status", value: "active" },
  ]);
}

async function handleCreateCraneJobDraft(supabase: any, parsed: ParsedCommand, command: string) {
  const date = resolveDate(parsed.date_text, parsed.target_date);
  const customer = await resolveCustomer(supabase, parsed.customer_name);
  const crane = await resolveCrane(supabase, parsed.crane_name);
  const operator = await resolveOperator(supabase, parsed.operator_name);
  const warnings = [customer.warning, crane.warning, operator.warning].filter(Boolean).join(" ") || null;
  const siteContactName = clean(parsed.contact_name) ?? clean(customer.selected?.contact_name);
  const siteContactPhone = clean(parsed.phone) ?? clean(customer.selected?.phone);

  const missing: string[] = [];
  if (!customer.selected) missing.push(parsed.customer_name ? `Customer not found: ${parsed.customer_name}` : "Customer missing");
  if (!date) missing.push(parsed.date_text ? `I could not understand the date: ${parsed.date_text}` : "Date missing");
  if (!siteContactName || !siteContactPhone) missing.push(CRANE_JOB_SITE_CONTACT_ERROR);
  if (missing.length) {
    return needMore("I need a bit more information", missing.join(". "), [
      ...customer.matches.slice(0, 5).map((row: any) => ({ label: row.company_name ?? "Customer", href: `/customers/${row.id}`, badge: "customer", description: `${row.contact_name ?? "—"} • ${row.phone ?? row.email ?? "—"}` })),
      ...crane.matches.slice(0, 5).map((row: any) => ({ label: row.name ?? "Crane", href: `/cranes/${row.id}`, badge: "crane", description: `${row.reg_number ?? row.fleet_number ?? "—"} • ${row.status ?? "—"}` })),
    ]);
  }

  const draft: DraftAction = {
    type: "create_crane_job",
    title: "Create crane job",
    risk: "medium",
    warning: warnings ?? (crane.selected ? null : "No crane was confidently matched, so this will create the job without a crane allocation."),
    preview: [
      { label: "Customer", value: customer.selected.company_name ?? "—" },
      { label: "Date", value: formatDate(date) },
      { label: "Crane", value: crane.selected?.name ?? "Not allocated" },
      { label: "Operator", value: operator.selected?.full_name ?? "Not allocated" },
      { label: "Status", value: "Provisional" },
      { label: "Times", value: "08:00 → 16:00" },
      { label: "Site contact", value: siteContactName ?? "—" },
      { label: "Site number", value: siteContactPhone ?? "—" },
    ],
    payload: { client_id: customer.selected.id, crane_id: crane.selected?.id ?? null, operator_id: operator.selected?.id ?? null, job_date: date, start_date: date, end_date: clean(parsed.end_date) ?? date, start_time: "08:00", end_time: "16:00", status: "provisional", site_name: clean(parsed.site_name), site_address: clean(parsed.site_address), contact_name: siteContactName, contact_phone: siteContactPhone, notes: `Created by AnnS CRM Assistant from command: ${command}` },
  };
  return draftResponse(draft, "I have prepared this job. Check it, then confirm to save it.");
}

async function handleCreateTransportJobDraft(supabase: any, parsed: ParsedCommand, command: string) {
  const date = resolveDate(parsed.date_text, parsed.target_date);
  const customer = await resolveCustomer(supabase, parsed.customer_name);
  const vehicle = await resolveVehicle(supabase, parsed.vehicle_name);
  const operator = await resolveOperator(supabase, parsed.operator_name);
  const collectionContactName = clean(parsed.contact_name) ?? clean(customer.selected?.contact_name);
  const collectionContactPhone = clean(parsed.phone) ?? clean(customer.selected?.phone);
  const missing: string[] = [];
  if (!customer.selected) missing.push(parsed.customer_name ? `Customer not found: ${parsed.customer_name}` : "Customer missing");
  if (!date) missing.push("Transport date missing");
  if (!clean(parsed.collection_address)) missing.push("Collection address missing");
  if (!clean(parsed.delivery_address)) missing.push("Delivery address missing");
  if (!collectionContactName || !collectionContactPhone) missing.push(TRANSPORT_JOB_SITE_CONTACT_ERROR);
  if (missing.length) return needMore("Transport job needs more details", missing.join(". "), customer.matches.slice(0, 5).map((row: any) => ({ label: row.company_name, href: `/customers/${row.id}`, badge: "customer", description: row.phone ?? row.email ?? "" })));

  const draft: DraftAction = {
    type: "create_transport_job",
    title: "Create transport job",
    risk: "medium",
    warning: [customer.warning, vehicle.warning, operator.warning].filter(Boolean).join(" ") || null,
    preview: [
      { label: "Customer", value: customer.selected.company_name ?? "—" },
      { label: "Date", value: formatDate(date) },
      { label: "Collection", value: clean(parsed.collection_address) ?? "—" },
      { label: "Delivery", value: clean(parsed.delivery_address) ?? "—" },
      { label: "Pickup / site contact", value: collectionContactName ?? "—" },
      { label: "Pickup / site number", value: collectionContactPhone ?? "—" },
      { label: "Vehicle", value: vehicle.selected?.name ?? "Not allocated" },
      { label: "Driver", value: operator.selected?.full_name ?? "Not allocated" },
    ],
    payload: { client_id: customer.selected.id, vehicle_id: vehicle.selected?.id ?? null, operator_id: operator.selected?.id ?? null, transport_date: date, delivery_date: clean(parsed.end_date) ?? date, collection_time: "08:00", delivery_time: "16:00", collection_address: clean(parsed.collection_address), delivery_address: clean(parsed.delivery_address), collection_contact_name: collectionContactName, collection_contact_phone: collectionContactPhone, load_description: clean(parsed.load_description), status: "planned", notes: `Created by AnnS CRM Assistant from command: ${command}` },
  };
  return draftResponse(draft);
}

async function handleMoveJobDraft(supabase: any, parsed: ParsedCommand) {
  const date = resolveDate(parsed.date_text, parsed.target_date);
  const job = await findJobByNumber(supabase, parsed.job_number);
  if (!job || !date) return needMore("I need a job number and date", !job ? "I could not find that job." : "I could not understand the new date.");
  const oldStart = clean(job.start_date) ?? clean(job.job_date) ?? date;
  const oldEnd = clean(job.end_date) ?? oldStart;
  const duration = daysBetween(oldStart, oldEnd);
  const newEnd = clean(parsed.end_date) ?? addDays(date, duration);
  const draft: DraftAction = {
    type: "move_crane_job",
    title: `Move job ${job.job_number}`,
    risk: "medium",
    warning: "This will move the main job dates and any allocation dates by the same number of days.",
    preview: [
      { label: "Job", value: `Job ${job.job_number}` },
      { label: "From", value: `${formatDate(oldStart)}${oldEnd !== oldStart ? ` → ${formatDate(oldEnd)}` : ""}` },
      { label: "To", value: `${formatDate(date)}${newEnd !== date ? ` → ${formatDate(newEnd)}` : ""}` },
      { label: "Customer", value: first(job.clients)?.company_name ?? "—" },
    ],
    payload: { job_id: job.id, job_number: job.job_number, old_start_date: oldStart, old_end_date: oldEnd, new_start_date: date, new_end_date: newEnd, day_delta: daysBetween(oldStart, date) },
  };
  return draftResponse(draft, "I have prepared the date change. Check it, then confirm to save it.", [jobResult(job)]);
}

async function handleMoveTransportDraft(supabase: any, parsed: ParsedCommand) {
  const date = resolveDate(parsed.date_text, parsed.target_date);
  const job = await findTransportByNumber(supabase, parsed.transport_number);
  if (!job || !date) return needMore("I need a transport job and date", !job ? "I could not find that transport job." : "I could not understand the new date.");
  const oldStart = clean(job.transport_date) ?? date;
  const oldEnd = clean(job.delivery_date) ?? oldStart;
  const newEnd = clean(parsed.end_date) ?? addDays(date, daysBetween(oldStart, oldEnd));
  const draft: DraftAction = {
    type: "move_transport_job",
    title: `Move ${job.transport_number}`,
    risk: "medium",
    warning: "This will move the transport and delivery dates by the same number of days.",
    preview: [
      { label: "Transport", value: job.transport_number ?? "—" },
      { label: "From", value: `${formatDate(oldStart)}${oldEnd !== oldStart ? ` → ${formatDate(oldEnd)}` : ""}` },
      { label: "To", value: `${formatDate(date)}${newEnd !== date ? ` → ${formatDate(newEnd)}` : ""}` },
    ],
    payload: { transport_job_id: job.id, transport_number: job.transport_number, old_start_date: oldStart, old_end_date: oldEnd, new_start_date: date, new_end_date: newEnd },
  };
  return draftResponse(draft, "I have prepared the transport date change. Check it, then confirm to save it.", [transportResult(job)]);
}

async function handleAssignOperatorDraft(supabase: any, parsed: ParsedCommand) {
  const target = parsed.entity_type === "transport_job" || parsed.transport_number ? "transport_job" : "job";
  const job = target === "transport_job" ? await findTransportByNumber(supabase, parsed.transport_number) : await findJobByNumber(supabase, parsed.job_number);
  const operator = await resolveOperator(supabase, parsed.operator_name);
  if (!job || !operator.selected) return needMore("I need a job and operator", !job ? "I could not find the job." : `I could not find operator ${parsed.operator_name ?? ""}.`, operator.matches.slice(0, 6).map((row: any) => ({ label: row.full_name ?? "Operator", href: `/operators/${row.id}`, badge: "operator", description: row.status ?? "—" })));
  const startDate = target === "transport_job" ? clean(job.transport_date) : clean(job.start_date) ?? clean(job.job_date);
  const endDate = target === "transport_job" ? clean(job.delivery_date) ?? startDate : clean(job.end_date) ?? startDate;
  const draft: DraftAction = {
    type: "assign_operator",
    title: `Add ${operator.selected.full_name}`,
    risk: "medium",
    warning: operator.warning,
    preview: [
      { label: "Record", value: target === "transport_job" ? job.transport_number ?? "Transport job" : `Job ${job.job_number}` },
      { label: "Operator/driver", value: operator.selected.full_name ?? "—" },
      { label: "Dates", value: `${formatDate(startDate)}${endDate && endDate !== startDate ? ` → ${formatDate(endDate)}` : ""}` },
    ],
    payload: { target, job_id: target === "job" ? job.id : null, transport_job_id: target === "transport_job" ? job.id : null, job_number: job.job_number ?? null, transport_number: job.transport_number ?? null, operator_id: operator.selected.id, operator_name: operator.selected.full_name, start_date: startDate, end_date: endDate, start_time: job.start_time ?? job.collection_time ?? null, end_time: job.end_time ?? job.delivery_time ?? null },
  };
  return draftResponse(draft, "I have prepared the operator/driver allocation. Check it, then confirm to save it.", [target === "job" ? jobResult(job) : transportResult(job)]);
}

async function handleAssignCraneDraft(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  const crane = await resolveCrane(supabase, parsed.crane_name);
  if (!job || !crane.selected) return needMore("I need a job and crane", !job ? "I could not find the job." : `I could not find crane ${parsed.crane_name ?? ""}.`, crane.matches.slice(0, 6).map((row: any) => ({ label: row.name ?? "Crane", href: `/cranes/${row.id}`, badge: "crane", description: row.reg_number ?? row.fleet_number ?? "" })));
  const startDate = clean(job.start_date) ?? clean(job.job_date);
  const endDate = clean(job.end_date) ?? startDate;
  const draft: DraftAction = {
    type: "assign_crane",
    title: `Add ${crane.selected.name} to job ${job.job_number}`,
    risk: "medium",
    warning: crane.warning,
    preview: [
      { label: "Job", value: `Job ${job.job_number}` },
      { label: "Crane", value: crane.selected.name ?? "—" },
      { label: "Dates", value: `${formatDate(startDate)}${endDate && endDate !== startDate ? ` → ${formatDate(endDate)}` : ""}` },
    ],
    payload: { job_id: job.id, job_number: job.job_number, crane_id: crane.selected.id, crane_name: crane.selected.name, start_date: startDate, end_date: endDate, start_time: job.start_time ?? null, end_time: job.end_time ?? null },
  };
  return draftResponse(draft, "I have prepared the crane allocation. Check it, then confirm to save it.", [jobResult(job)]);
}

async function handleAssignVehicleDraft(supabase: any, parsed: ParsedCommand) {
  const job = await findTransportByNumber(supabase, parsed.transport_number);
  const vehicle = await resolveVehicle(supabase, parsed.vehicle_name);
  if (!job || !vehicle.selected) return needMore("I need a transport job and vehicle", !job ? "I could not find the transport job." : `I could not find vehicle ${parsed.vehicle_name ?? ""}.`, vehicle.matches.slice(0, 6).map((row: any) => ({ label: row.name ?? row.reg_number ?? "Vehicle", href: `/vehicles/${row.id}`, badge: "vehicle", description: row.reg_number ?? row.vehicle_type ?? "" })));
  const draft: DraftAction = { type: "assign_vehicle", title: `Assign ${vehicle.selected.name ?? vehicle.selected.reg_number}`, risk: "medium", warning: vehicle.warning, preview: [
    { label: "Transport", value: job.transport_number ?? "—" },
    { label: "Vehicle", value: `${vehicle.selected.name ?? "—"} ${vehicle.selected.reg_number ? `(${vehicle.selected.reg_number})` : ""}` },
  ], payload: { transport_job_id: job.id, transport_number: job.transport_number, vehicle_id: vehicle.selected.id, vehicle_name: vehicle.selected.name ?? vehicle.selected.reg_number } };
  return draftResponse(draft, "I have prepared the vehicle allocation. Check it, then confirm to save it.", [transportResult(job)]);
}

async function handleStatusDraft(supabase: any, parsed: ParsedCommand, transport = false) {
  const status = normaliseStatus(parsed.status, transport ? "transport" : "job");
  const job = transport ? await findTransportByNumber(supabase, parsed.transport_number) : await findJobByNumber(supabase, parsed.job_number);
  if (!job || !status) return needMore("I need a record and status", !job ? "I could not find the record." : "I could not understand the status.");
  const high = ["cancelled", "late_cancelled"].includes(status);
  const draft: DraftAction = { type: transport ? "update_transport_status" : "update_job_status", title: `Set status to ${status}`, risk: high ? "high" : "medium", requires_reason: high, requires_confirm_text: high, confirm_text: high ? "CONFIRM" : null, warning: high ? "This is a high-risk status change and may remove the record from planners." : null, preview: [
    { label: "Record", value: transport ? job.transport_number ?? "Transport" : `Job ${job.job_number}` },
    { label: "Current status", value: job.status ?? "—" },
    { label: "New status", value: status },
  ], payload: { target: transport ? "transport_job" : "job", id: job.id, reference: transport ? job.transport_number : job.job_number, old_status: job.status ?? null, new_status: status } };
  return draftResponse(draft, "I have prepared the status change. Check it, then confirm to save it.", [transport ? transportResult(job) : jobResult(job)]);
}

async function handleInvoiceStatusDraft(supabase: any, parsed: ParsedCommand) {
  const target = parsed.entity_type === "transport_job" || parsed.transport_number ? "transport_job" : "job";
  const status = normaliseInvoiceStatus(parsed.invoice_status) ?? normaliseInvoiceStatus(parsed.search_query) ?? "Invoiced";
  const job = target === "transport_job" ? await findTransportByNumber(supabase, parsed.transport_number) : await findJobByNumber(supabase, parsed.job_number);
  if (!job) return needMore("I need a valid job", "I could not find the record to update.");
  const high = status === "Paid";
  const draft: DraftAction = { type: "update_invoice_status", title: `Set invoice status to ${status}`, risk: high ? "high" : "medium", requires_reason: high, requires_confirm_text: high, confirm_text: high ? "CONFIRM" : null, warning: high ? "Marking a full job paid is high-risk. Use visit invoicing if only one visit/week has been invoiced." : "This changes the full job invoice status. For multi-visit jobs, use visit invoicing instead.", preview: [
    { label: "Record", value: target === "transport_job" ? job.transport_number ?? "Transport" : `Job ${job.job_number}` },
    { label: "Current invoice status", value: job.invoice_status ?? "Not Invoiced" },
    { label: "New invoice status", value: status },
  ], payload: { target, id: job.id, reference: target === "transport_job" ? job.transport_number : job.job_number, old_invoice_status: job.invoice_status ?? null, new_invoice_status: status } };
  return draftResponse(draft, "I have prepared the invoice status change. Check it, then confirm to save it.", [target === "transport_job" ? transportResult(job) : jobResult(job)]);
}

async function handleVisitInvoiceDraft(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  const visitDate = resolveDate(parsed.date_text, parsed.visit_date) ?? currentTodayIso();
  if (!job) return needMore("I need a valid job number", parsed.job_number ? `I could not find job ${parsed.job_number}.` : "Tell me the job number to mark invoiced.");
  const draft: DraftAction = { type: "mark_visit_invoiced", title: "Mark visit invoiced", risk: "medium", warning: "This only marks the selected visit/day as invoiced. It does not mark the whole job as paid.", preview: [
    { label: "Job", value: `Job ${job.job_number}` },
    { label: "Customer", value: first(job.clients)?.company_name ?? "—" },
    { label: "Visit date", value: formatDate(visitDate) },
    { label: "New visit invoice status", value: "Invoiced" },
  ], payload: { job_id: job.id, job_number: job.job_number, visit_date: visitDate, invoice_status: "Invoiced", notes: "Marked through AnnS CRM Assistant." } };
  return draftResponse(draft, "I have prepared the visit invoice mark. Check it, then confirm to save it.", [jobResult(job)]);
}

async function handleAddNoteDraft(supabase: any, parsed: ParsedCommand) {
  const target = parsed.entity_type === "transport_job" || parsed.transport_number ? "transport_job" : "job";
  const job = target === "transport_job" ? await findTransportByNumber(supabase, parsed.transport_number) : await findJobByNumber(supabase, parsed.job_number);
  const note = clean(parsed.notes ?? parsed.search_query);
  if (!job || !note) return needMore("I need a record and note", !job ? "I could not find the record." : "Tell me the note to add.");
  const draft: DraftAction = { type: "add_note", title: "Add note", risk: "low", preview: [
    { label: "Record", value: target === "transport_job" ? job.transport_number ?? "Transport" : `Job ${job.job_number}` },
    { label: "Note", value: note },
  ], payload: { target, id: job.id, reference: target === "transport_job" ? job.transport_number : job.job_number, note } };
  return draftResponse(draft, "I have prepared the note. Check it, then confirm to save it.", [target === "transport_job" ? transportResult(job) : jobResult(job)]);
}

async function handleUpdateSiteDraft(supabase: any, parsed: ParsedCommand) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  const site = clean(parsed.site_name);
  const address = clean(parsed.site_address ?? parsed.search_query);
  if (!job || (!site && !address)) return needMore("I need a job and site details", !job ? "I could not find the job." : "Tell me the site name or address to set.");
  const draft: DraftAction = { type: "update_job_site", title: `Update site for job ${job.job_number}`, risk: "medium", preview: [
    { label: "Job", value: `Job ${job.job_number}` },
    { label: "Old site", value: job.site_name ?? job.site_address ?? "—" },
    { label: "New site name", value: site ?? "No change" },
    { label: "New site address", value: address ?? "No change" },
  ], payload: { job_id: job.id, job_number: job.job_number, site_name: site, site_address: address } };
  return draftResponse(draft, "I have prepared the site update. Check it, then confirm to save it.", [jobResult(job)]);
}

async function handleCancelDraft(supabase: any, parsed: ParsedCommand) {
  const target = parsed.entity_type === "transport_job" || parsed.transport_number ? "transport_job" : "job";
  const job = target === "transport_job" ? await findTransportByNumber(supabase, parsed.transport_number) : await findJobByNumber(supabase, parsed.job_number);
  if (!job) return needMore("I need a valid record", "I could not find the job/transport job to cancel.");
  const status = normaliseStatus(parsed.status, target === "transport_job" ? "transport" : "job") ?? "cancelled";
  const draft: DraftAction = { type: "cancel_record", title: `Cancel ${target === "transport_job" ? job.transport_number : `job ${job.job_number}`}`, risk: "high", requires_reason: true, requires_confirm_text: true, confirm_text: "CONFIRM", warning: "Cancelling is high-risk. It can remove the record from planners and affect invoice/action lists.", preview: [
    { label: "Record", value: target === "transport_job" ? job.transport_number ?? "Transport" : `Job ${job.job_number}` },
    { label: "Current status", value: job.status ?? "—" },
    { label: "New status", value: status },
  ], payload: { target, id: job.id, reference: target === "transport_job" ? job.transport_number : job.job_number, old_status: job.status ?? null, new_status: status } };
  return draftResponse(draft, "I have prepared the cancellation. Add a reason and type CONFIRM before saving.", [target === "transport_job" ? transportResult(job) : jobResult(job)]);
}

async function handleLiftPlanLockDraft(supabase: any, parsed: ParsedCommand, unlock = false) {
  const job = await findJobByNumber(supabase, parsed.job_number);
  if (!job) return needMore("Job not found", parsed.job_number ? `I could not find job ${parsed.job_number}.` : "Tell me the job number.");
  const draft: DraftAction = { type: unlock ? "unlock_lift_plan" : "lock_lift_plan", title: `${unlock ? "Unlock" : "Lock"} lift plan for job ${job.job_number}`, risk: "high", requires_reason: true, requires_confirm_text: true, confirm_text: "CONFIRM", warning: `${unlock ? "Unlocking" : "Locking"} a lift plan is high-risk. A reason and CONFIRM are required.`, preview: [
    { label: "Job", value: `Job ${job.job_number}` },
    { label: "Action", value: unlock ? "Unlock lift plan" : "Lock lift plan" },
  ], payload: { job_id: job.id, job_number: job.job_number, action: unlock ? "unlock" : "lock" } };
  return draftResponse(draft, `I have prepared the lift plan ${unlock ? "unlock" : "lock"}. Add a reason and type CONFIRM before saving.`, [jobResult(job)]);
}

async function executeCreateCustomer(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const companyName = clean(p.company_name);
  if (!companyName) throw new Error("Company name is required.");
  const payload = { company_name: companyName, contact_name: clean(p.contact_name), phone: clean(p.phone), email: clean(p.email), notes: clean(p.notes), archived: false, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("clients").insert(payload).select("id, company_name").single();
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_customer_created", "customer", data.id, payload);
  return executed(`Customer created`, `${companyName} has been saved.`, `/customers/${data.id}`, { label: companyName, href: `/customers/${data.id}`, badge: "created", description: "Customer created by CRM Assistant." });
}

async function executeCreateSupplier(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const companyName = clean(p.company_name);
  if (!companyName) throw new Error("Supplier name is required.");
  const payload = { company_name: companyName, contact_name: clean(p.contact_name), phone: clean(p.phone), email: clean(p.email), notes: clean(p.notes), status: clean(p.status) ?? "active", updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("suppliers").insert(payload).select("id, company_name").single();
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_supplier_created", "supplier", data.id, payload);
  return executed(`Supplier created`, `${companyName} has been saved.`, `/suppliers/${data.id}`, { label: companyName, href: `/suppliers/${data.id}`, badge: "created", description: "Supplier/sub-contractor created by CRM Assistant." });
}

async function executeCreateOperator(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const fullName = clean(p.full_name);
  if (!fullName) throw new Error("Operator name is required.");
  const payload = { full_name: fullName, email: clean(p.email), phone: clean(p.phone), status: clean(p.status) ?? "active", notes: clean(p.notes), archived: false, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("operators").insert(payload).select("id, full_name").single();
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_operator_created", "operator", data.id, payload);
  return executed(`Operator created`, `${fullName} has been saved.`, `/operators/${data.id}`, { label: fullName, href: `/operators/${data.id}`, badge: "created", description: "Operator/staff created by CRM Assistant." });
}

async function executeCreateCrane(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const name = clean(p.name);
  if (!name) throw new Error("Crane name is required.");
  const payload = { name, reg_number: clean(p.reg_number), status: clean(p.status) ?? "available", archived: false, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("cranes").insert(payload).select("id, name").single();
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_crane_created", "crane", data.id, payload);
  return executed(`Crane created`, `${name} has been saved.`, `/cranes/${data.id}`, { label: name, href: `/cranes/${data.id}`, badge: "created", description: "Crane created by CRM Assistant." });
}

async function executeCreateVehicle(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const name = clean(p.name);
  if (!name) throw new Error("Vehicle name is required.");
  const payload = { name, reg_number: clean(p.reg_number), vehicle_type: clean(p.vehicle_type), status: clean(p.status) ?? "active", updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("vehicles").insert(payload).select("id, name").single();
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_vehicle_created", "vehicle", data.id, payload);
  return executed(`Vehicle created`, `${name} has been saved.`, `/vehicles/${data.id}`, { label: name, href: `/vehicles/${data.id}`, badge: "created", description: "Vehicle created by CRM Assistant." });
}

async function executeCreateCraneJob(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const startDate = clean(p.start_date) ?? clean(p.job_date);
  const endDate = clean(p.end_date) ?? startDate;
  if (!p.client_id || !startDate || !endDate) throw new Error("Customer and date are required before creating the job.");
  assertRequiredCraneJobSiteContact(p);
  if (p.operator_id) await assertOperatorAvailable(supabase, { operatorId: p.operator_id, startDate, endDate, startTime: clean(p.start_time), endTime: clean(p.end_time) });
  const jobPayload: Record<string, any> = { client_id: clean(p.client_id), operator_id: clean(p.operator_id), site_name: clean(p.site_name), site_address: clean(p.site_address), contact_name: clean(p.contact_name), contact_phone: clean(p.contact_phone), job_date: startDate, start_date: startDate, end_date: endDate, start_time: clean(p.start_time) ?? "08:00", end_time: clean(p.end_time) ?? "16:00", status: clean(p.status) ?? "provisional", hire_type: clean(p.hire_type), lift_type: clean(p.lift_type), notes: clean(p.notes), equipment_count: p.crane_id ? 1 : 0, archived: false, created_by: user.id, updated_at: new Date().toISOString() };
  const { data: job, error } = await supabase.from("jobs").insert(jobPayload).select("id, job_number").single();
  if (error || !job?.id) throw new Error(error?.message ?? "Could not create job.");
  if (p.crane_id || p.operator_id) {
    const allocationPayload: Record<string, any> = { job_id: job.id, asset_type: p.crane_id ? "crane" : "other", crane_id: clean(p.crane_id), operator_id: clean(p.operator_id), source_type: "owned", start_date: startDate, end_date: endDate, start_time: clean(p.start_time) ?? "08:00", end_time: clean(p.end_time) ?? "16:00", agreed_cost: 0, agreed_sell_rate: 0, supplier_cost: 0, item_name: p.crane_id ? null : "Operator / labour", notes: "Created by AnnS CRM Assistant.", updated_at: new Date().toISOString() };
    const { error: allocationError } = await supabase.from("job_equipment").insert(allocationPayload);
    if (allocationError) {
      await supabase.from("jobs").delete().eq("id", job.id);
      throw new Error(allocationError.message);
    }
  }
  await audit(user, "crm_assistant_job_created", "job", job.id, { job_number: job.job_number ?? null, ...jobPayload, crane_id: clean(p.crane_id) });
  return executed(`Job ${job.job_number ?? ""} created`, "The crane job has been saved.", `/jobs/${job.id}`, { label: `Open job ${job.job_number ?? ""}`, href: `/jobs/${job.id}`, badge: "created", description: "The job was created from the CRM Assistant." });
}

async function executeCreateTransportJob(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const date = clean(p.transport_date);
  if (!p.client_id || !date || !clean(p.collection_address) || !clean(p.delivery_address)) throw new Error("Customer, date, collection and delivery are required before creating transport.");
  assertRequiredTransportJobSiteContact(p);
  if (p.operator_id) await assertOperatorAvailable(supabase, { operatorId: p.operator_id, startDate: date, endDate: clean(p.delivery_date) ?? date, startTime: clean(p.collection_time), endTime: clean(p.delivery_time) });
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const payload: Record<string, any> = { transport_number: `TR-${stamp}`, client_id: clean(p.client_id), vehicle_id: clean(p.vehicle_id), operator_id: clean(p.operator_id), collection_address: clean(p.collection_address), delivery_address: clean(p.delivery_address), collection_contact_name: clean(p.collection_contact_name), collection_contact_phone: clean(p.collection_contact_phone), delivery_contact_name: clean(p.delivery_contact_name), delivery_contact_phone: clean(p.delivery_contact_phone), transport_date: date, delivery_date: clean(p.delivery_date) ?? date, collection_time: clean(p.collection_time) ?? "08:00", delivery_time: clean(p.delivery_time) ?? "16:00", load_description: clean(p.load_description), notes: clean(p.notes), price: 0, agreed_sell_rate: 0, invoice_status: "Not Invoiced", invoice_subtotal: 0, invoice_vat: 0, total_invoice: 0, status: clean(p.status) ?? "planned", archived: false, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("transport_jobs").insert(payload).select("id, transport_number").single();
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_transport_created", "transport_job", data.id, payload);
  return executed(`${data.transport_number ?? "Transport job"} created`, "The transport job has been saved.", `/transport-jobs/${data.id}`, { label: `Open ${data.transport_number ?? "transport job"}`, href: `/transport-jobs/${data.id}`, badge: "created", description: "The transport job was created from the CRM Assistant." });
}

async function executeMoveJob(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const jobId = clean(p.job_id);
  const newStart = clean(p.new_start_date);
  const newEnd = clean(p.new_end_date) ?? newStart;
  const delta = Number(p.day_delta ?? 0);
  if (!jobId || !newStart || !newEnd) throw new Error("Job and new date are required.");
  const { data: existingJob, error: existingError } = await supabase.from("jobs").select("id, job_number, start_date, end_date, job_date").eq("id", jobId).single();
  if (existingError || !existingJob) throw new Error("Job not found.");
  const { error: jobError } = await supabase.from("jobs").update({ job_date: newStart, start_date: newStart, end_date: newEnd, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (jobError) throw new Error(jobError.message);
  const { data: rows, error: rowsError } = await supabase.from("job_equipment").select("id, start_date, end_date").eq("job_id", jobId);
  if (rowsError) throw new Error(rowsError.message);
  for (const row of rows ?? []) {
    const rowStart = clean(row.start_date);
    const rowEnd = clean(row.end_date) ?? rowStart;
    if (!rowStart) continue;
    const { error: rowError } = await supabase.from("job_equipment").update({ start_date: addDays(rowStart, delta), end_date: rowEnd ? addDays(rowEnd, delta) : addDays(rowStart, delta), updated_at: new Date().toISOString() }).eq("id", row.id);
    if (rowError) throw new Error(rowError.message);
  }
  const { data: allocationRows, error: allocationRowsError } = await supabase.from("job_allocations").select("id, start_at, end_at").eq("job_id", jobId);
  if (!allocationRowsError) {
    for (const row of allocationRows ?? []) {
      const shiftedStart = shiftTimestampDate(row.start_at, delta);
      const shiftedEnd = shiftTimestampDate(row.end_at, delta) ?? shiftedStart;
      if (!shiftedStart) continue;
      const { error: allocationError } = await supabase.from("job_allocations").update({ start_at: shiftedStart, end_at: shiftedEnd }).eq("id", row.id);
      if (allocationError) throw new Error(allocationError.message);
    }
  }
  await audit(user, "crm_assistant_job_moved", "job", jobId, { job_number: existingJob.job_number ?? null, old_start_date: existingJob.start_date ?? existingJob.job_date ?? null, new_start_date: newStart, new_end_date: newEnd, day_delta: delta });
  return executed(`Job ${existingJob.job_number ?? ""} moved`, `The job was moved to ${formatDate(newStart)}.`, `/jobs/${jobId}`, { label: `Open job ${existingJob.job_number ?? ""}`, href: `/jobs/${jobId}`, badge: "moved", description: `Moved to ${formatDate(newStart)}` });
}

async function executeMoveTransport(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const id = clean(p.transport_job_id);
  const newStart = clean(p.new_start_date);
  const newEnd = clean(p.new_end_date) ?? newStart;
  if (!id || !newStart || !newEnd) throw new Error("Transport job and new date are required.");
  const { data: existing, error: existingError } = await supabase.from("transport_jobs").select("id, transport_number, transport_date, delivery_date").eq("id", id).single();
  if (existingError || !existing) throw new Error("Transport job not found.");
  const { error } = await supabase.from("transport_jobs").update({ transport_date: newStart, delivery_date: newEnd, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_transport_moved", "transport_job", id, { transport_number: existing.transport_number, old_start_date: existing.transport_date, new_start_date: newStart, new_end_date: newEnd });
  return executed(`${existing.transport_number ?? "Transport"} moved`, `The transport job was moved to ${formatDate(newStart)}.`, `/transport-jobs/${id}`, { label: `Open ${existing.transport_number ?? "transport job"}`, href: `/transport-jobs/${id}`, badge: "moved", description: `Moved to ${formatDate(newStart)}` });
}

async function executeAssignOperator(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  if (p.target === "transport_job") {
    const id = clean(p.transport_job_id);
    const operatorId = clean(p.operator_id);
    if (!id || !operatorId) throw new Error("Transport job and operator are required.");
    await assertOperatorAvailable(supabase, { operatorId, startDate: clean(p.start_date), endDate: clean(p.end_date) ?? clean(p.start_date), startTime: clean(p.start_time), endTime: clean(p.end_time) });
    const { error } = await supabase.from("transport_jobs").update({ operator_id: operatorId, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    await audit(user, "crm_assistant_transport_operator_assigned", "transport_job", id, { operator_id: operatorId, operator_name: p.operator_name ?? null });
    return executed("Driver added", `${p.operator_name ?? "Driver"} has been added.`, `/transport-jobs/${id}`, { label: `Open ${p.transport_number ?? "transport job"}`, href: `/transport-jobs/${id}`, badge: "updated", description: `${p.operator_name ?? "Driver"} assigned.` });
  }

  const jobId = clean(p.job_id);
  const operatorId = clean(p.operator_id);
  if (!jobId || !operatorId) throw new Error("Job and operator are required.");
  await assertOperatorAvailable(supabase, { operatorId, startDate: clean(p.start_date), endDate: clean(p.end_date) ?? clean(p.start_date), startTime: clean(p.start_time), endTime: clean(p.end_time) });
  const payload: Record<string, any> = { job_id: jobId, asset_type: "other", operator_id: operatorId, item_name: "Operator / labour", source_type: "owned", start_date: clean(p.start_date), end_date: clean(p.end_date) ?? clean(p.start_date), start_time: clean(p.start_time), end_time: clean(p.end_time), agreed_cost: 0, agreed_sell_rate: 0, supplier_cost: 0, notes: "Added by AnnS CRM Assistant.", updated_at: new Date().toISOString() };
  const { error } = await supabase.from("job_equipment").insert(payload);
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_operator_assigned", "job", jobId, { job_number: p.job_number ?? null, operator_id: operatorId, operator_name: p.operator_name ?? null });
  return executed("Operator added", `${p.operator_name ?? "Operator"} has been added to job ${p.job_number ?? ""}.`, `/jobs/${jobId}`, { label: `Open job ${p.job_number ?? ""}`, href: `/jobs/${jobId}`, badge: "updated", description: `${p.operator_name ?? "Operator"} added as labour/operator allocation.` });
}

async function executeAssignCrane(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const jobId = clean(p.job_id);
  const craneId = clean(p.crane_id);
  if (!jobId || !craneId) throw new Error("Job and crane are required.");
  const payload: Record<string, any> = { job_id: jobId, asset_type: "crane", crane_id: craneId, source_type: "owned", start_date: clean(p.start_date), end_date: clean(p.end_date) ?? clean(p.start_date), start_time: clean(p.start_time), end_time: clean(p.end_time), agreed_cost: 0, agreed_sell_rate: 0, supplier_cost: 0, notes: "Added by AnnS CRM Assistant.", updated_at: new Date().toISOString() };
  const { error } = await supabase.from("job_equipment").insert(payload);
  if (error) throw new Error(error.message);
  await supabase.from("jobs").update({ equipment_count: 1, updated_at: new Date().toISOString() }).eq("id", jobId);
  await audit(user, "crm_assistant_crane_assigned", "job", jobId, { job_number: p.job_number ?? null, crane_id: craneId, crane_name: p.crane_name ?? null });
  return executed("Crane added", `${p.crane_name ?? "Crane"} has been added to job ${p.job_number ?? ""}.`, `/jobs/${jobId}`, { label: `Open job ${p.job_number ?? ""}`, href: `/jobs/${jobId}`, badge: "updated", description: `${p.crane_name ?? "Crane"} added as a crane allocation.` });
}

async function executeAssignVehicle(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const id = clean(p.transport_job_id);
  const vehicleId = clean(p.vehicle_id);
  if (!id || !vehicleId) throw new Error("Transport job and vehicle are required.");
  const { error } = await supabase.from("transport_jobs").update({ vehicle_id: vehicleId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_vehicle_assigned", "transport_job", id, { vehicle_id: vehicleId, vehicle_name: p.vehicle_name ?? null });
  return executed("Vehicle added", `${p.vehicle_name ?? "Vehicle"} has been added.`, `/transport-jobs/${id}`, { label: `Open ${p.transport_number ?? "transport job"}`, href: `/transport-jobs/${id}`, badge: "updated", description: `${p.vehicle_name ?? "Vehicle"} assigned.` });
}

async function executeUpdateStatus(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const target = p.target === "transport_job" ? "transport_jobs" : "jobs";
  const id = clean(p.id);
  const newStatus = clean(p.new_status);
  if (!id || !newStatus) throw new Error("Record and status are required.");
  const { error } = await supabase.from(target).update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_status_updated", p.target === "transport_job" ? "transport_job" : "job", id, { reference: p.reference ?? null, old_status: p.old_status ?? null, new_status: newStatus });
  return executed("Status updated", `Status changed to ${newStatus}.`, p.target === "transport_job" ? `/transport-jobs/${id}` : `/jobs/${id}`, { label: `Open ${p.target === "transport_job" ? p.reference ?? "transport job" : `job ${p.reference ?? ""}`}`, href: p.target === "transport_job" ? `/transport-jobs/${id}` : `/jobs/${id}`, badge: "updated", description: `Status is now ${newStatus}.` });
}

async function executeUpdateInvoiceStatus(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const target = p.target === "transport_job" ? "transport_jobs" : "jobs";
  const id = clean(p.id);
  const newStatus = normaliseInvoiceStatus(p.new_invoice_status);
  if (!id || !newStatus) throw new Error("Record and invoice status are required.");
  const { error } = await supabase.from(target).update({ invoice_status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_invoice_status_updated", p.target === "transport_job" ? "transport_job" : "job", id, { reference: p.reference ?? null, old_invoice_status: p.old_invoice_status ?? null, new_invoice_status: newStatus });
  return executed("Invoice status updated", `Invoice status changed to ${newStatus}.`, p.target === "transport_job" ? `/transport-jobs/${id}` : `/jobs/${id}`, { label: `Open ${p.target === "transport_job" ? p.reference ?? "transport job" : `job ${p.reference ?? ""}`}`, href: p.target === "transport_job" ? `/transport-jobs/${id}` : `/jobs/${id}`, badge: "updated", description: `Invoice status is now ${newStatus}.` });
}

async function executeVisitInvoice(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const jobId = clean(p.job_id);
  const visitDate = clean(p.visit_date);
  if (!jobId || !visitDate) throw new Error("Job and visit date are required.");
  const payload = { job_id: jobId, visit_date: visitDate, invoice_status: clean(p.invoice_status) ?? "Invoiced", invoice_number: clean(p.invoice_number), invoice_date: currentTodayIso(), notes: clean(p.notes) ?? "Marked through AnnS CRM Assistant.", updated_at: new Date().toISOString(), created_by: user.id };
  const { error } = await supabase.from("job_visit_invoices").upsert(payload, { onConflict: "job_id,visit_date" });
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_visit_marked_invoiced", "job_visit_invoice", jobId, { job_number: p.job_number ?? null, visit_date: visitDate, invoice_status: payload.invoice_status });
  return executed("Visit marked invoiced", `Job ${p.job_number ?? ""} visit on ${formatDate(visitDate)} is now marked as invoiced.`, `/planner?date=${encodeURIComponent(visitDate)}`, { label: `Open planner on ${formatDate(visitDate)}`, href: `/planner?date=${encodeURIComponent(visitDate)}`, badge: "invoiced", description: "The visit invoice marker has been saved." });
}

async function executeAddNote(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const targetTable = p.target === "transport_job" ? "transport_jobs" : "jobs";
  const entityType = p.target === "transport_job" ? "transport_job" : "job";
  const id = clean(p.id);
  const note = clean(p.note);
  if (!id || !note) throw new Error("Record and note are required.");
  const { data: existing } = await supabase.from(targetTable).select("notes").eq("id", id).maybeSingle();
  const combined = [clean(existing?.notes), `[${new Date().toLocaleString("en-GB")}] ${note}`].filter(Boolean).join("\n\n");
  const { error } = await supabase.from(targetTable).update({ notes: combined, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_note_added", entityType, id, { note });
  return executed("Note added", "The note has been added.", entityType === "transport_job" ? `/transport-jobs/${id}` : `/jobs/${id}`, { label: "Open record", href: entityType === "transport_job" ? `/transport-jobs/${id}` : `/jobs/${id}`, badge: "updated", description: "Note added by CRM Assistant." });
}

async function executeUpdateJobSite(supabase: any, user: any, draft: DraftAction) {
  const p = draft.payload ?? {};
  const id = clean(p.job_id);
  if (!id) throw new Error("Job is required.");
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if ("site_name" in p) payload.site_name = clean(p.site_name);
  if ("site_address" in p) payload.site_address = clean(p.site_address);
  const { error } = await supabase.from("jobs").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_job_site_updated", "job", id, { job_number: p.job_number ?? null, site_name: payload.site_name ?? null, site_address: payload.site_address ?? null });
  return executed("Site updated", `Job ${p.job_number ?? ""} site details have been updated.`, `/jobs/${id}`, { label: `Open job ${p.job_number ?? ""}`, href: `/jobs/${id}`, badge: "updated", description: "Site details updated." });
}

async function executeCancelRecord(supabase: any, user: any, draft: DraftAction, reason: string | null) {
  const p = draft.payload ?? {};
  const targetTable = p.target === "transport_job" ? "transport_jobs" : "jobs";
  const entityType = p.target === "transport_job" ? "transport_job" : "job";
  const id = clean(p.id);
  const newStatus = clean(p.new_status) ?? "cancelled";
  if (!id) throw new Error("Record is required.");
  const { error } = await supabase.from(targetTable).update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(user, "crm_assistant_record_cancelled", entityType, id, { reference: p.reference ?? null, old_status: p.old_status ?? null, new_status: newStatus, reason });
  return executed("Record cancelled", `Status changed to ${newStatus}.`, entityType === "transport_job" ? `/transport-jobs/${id}` : `/jobs/${id}`, { label: "Open record", href: entityType === "transport_job" ? `/transport-jobs/${id}` : `/jobs/${id}`, badge: "cancelled", description: reason ?? "Cancelled by CRM Assistant." });
}

async function executeLiftPlanLock(supabase: any, user: any, draft: DraftAction, reason: string | null) {
  const p = draft.payload ?? {};
  const jobId = clean(p.job_id);
  const action = clean(p.action) === "unlock" ? "unlock" : "lock";
  if (!jobId) throw new Error("Job is required.");
  const { data: existing, error: existingError } = await supabase.from("lift_plans").select("id, paperwork_locked").eq("job_id", jobId).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing?.id && action === "unlock") throw new Error("Lift plan not found.");
  if (existing?.id) {
    const { error } = await supabase.from("lift_plans").update({ paperwork_locked: action === "lock", finalised_at: action === "lock" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("job_id", jobId);
    if (error) throw new Error(error.message);
    await audit(user, action === "lock" ? "crm_assistant_lift_plan_locked" : "crm_assistant_lift_plan_unlocked", "lift_plan", existing.id, { job_id: jobId, job_number: p.job_number ?? null, reason });
  } else {
    const { data, error } = await supabase.from("lift_plans").insert({ job_id: jobId, paperwork_locked: true, finalised_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_at: new Date().toISOString() }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(user, "crm_assistant_lift_plan_locked", "lift_plan", data.id, { job_id: jobId, job_number: p.job_number ?? null, reason });
  }
  return executed(`Lift plan ${action === "lock" ? "locked" : "unlocked"}`, `The lift plan for job ${p.job_number ?? ""} has been ${action === "lock" ? "locked" : "unlocked"}.`, `/jobs/${jobId}/lift-plan`, { label: `Open lift plan job ${p.job_number ?? ""}`, href: `/jobs/${jobId}/lift-plan`, badge: action === "lock" ? "locked" : "unlocked", description: reason ?? "Changed by CRM Assistant." });
}

async function executeArchiveRestore(supabase: any, user: any, draft: DraftAction, archived: boolean, reason: string | null) {
  const p = draft.payload ?? {};
  const entity = clean(p.entity_type) ?? "unknown";
  const id = clean(p.id);
  if (!id) throw new Error("Record id is required.");
  const tableByEntity: Record<string, string> = { job: "jobs", transport_job: "transport_jobs", customer: "clients", supplier: "suppliers", operator: "operators", crane: "cranes", vehicle: "vehicles", quote: "quotes", purchase_order: "purchase_orders" };
  const table = tableByEntity[entity];
  if (!table) throw new Error("That record type cannot be archived/restored by the assistant yet.");
  const { error } = await supabase.from(table).update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(user, archived ? "crm_assistant_record_archived" : "crm_assistant_record_restored", entity, id, { reason, reference: p.reference ?? null });
  return executed(archived ? "Record archived" : "Record restored", archived ? "The record has been archived." : "The record has been restored.", clean(p.href) ?? "/dashboard", { label: "Open record", href: clean(p.href) ?? "/dashboard", badge: archived ? "archived" : "restored", description: reason ?? "Changed by CRM Assistant." });
}

async function audit(user: any, action: string, entityType: string, entityId: string | null, meta: Record<string, any>) {
  await writeAuditLog({ actor_user_id: user.id, actor_username: fromAuthEmail(user.email), action, entity_type: entityType, entity_id: entityId, meta });
}

function executed(title: string, message: string, href: string, result: AssistantResult) {
  return { title, message, href, result };
}

function assertHighRiskInput(draft: DraftAction, body: any) {
  if (draft.risk !== "high") return { reason: clean(body?.reason), confirmText: clean(body?.confirmText) };
  const reason = clean(body?.reason);
  const confirmText = clean(body?.confirmText);
  if (draft.requires_reason && !reason) throw new Error("A reason is required for this high-risk action.");
  if (draft.requires_confirm_text && confirmText !== (draft.confirm_text ?? "CONFIRM")) throw new Error(`Type ${draft.confirm_text ?? "CONFIRM"} to confirm this high-risk action.`);
  return { reason, confirmText };
}

async function executeDraft(supabase: any, user: any, draft: DraftAction | null, body: any) {
  if (!draft?.type) throw new Error("Missing draft action.");
  const { reason } = assertHighRiskInput(draft, body);

  if (draft.type === "create_customer") return executeCreateCustomer(supabase, user, draft);
  if (draft.type === "create_supplier") return executeCreateSupplier(supabase, user, draft);
  if (draft.type === "create_operator") return executeCreateOperator(supabase, user, draft);
  if (draft.type === "create_crane") return executeCreateCrane(supabase, user, draft);
  if (draft.type === "create_vehicle") return executeCreateVehicle(supabase, user, draft);
  if (draft.type === "create_crane_job") return executeCreateCraneJob(supabase, user, draft);
  if (draft.type === "create_transport_job") return executeCreateTransportJob(supabase, user, draft);
  if (draft.type === "move_crane_job") return executeMoveJob(supabase, user, draft);
  if (draft.type === "move_transport_job") return executeMoveTransport(supabase, user, draft);
  if (draft.type === "assign_operator") return executeAssignOperator(supabase, user, draft);
  if (draft.type === "assign_crane") return executeAssignCrane(supabase, user, draft);
  if (draft.type === "assign_vehicle") return executeAssignVehicle(supabase, user, draft);
  if (draft.type === "update_job_status" || draft.type === "update_transport_status") return executeUpdateStatus(supabase, user, draft);
  if (draft.type === "update_invoice_status") return executeUpdateInvoiceStatus(supabase, user, draft);
  if (draft.type === "mark_visit_invoiced") return executeVisitInvoice(supabase, user, draft);
  if (draft.type === "add_note") return executeAddNote(supabase, user, draft);
  if (draft.type === "update_job_site") return executeUpdateJobSite(supabase, user, draft);
  if (draft.type === "cancel_record") return executeCancelRecord(supabase, user, draft, reason);
  if (draft.type === "lock_lift_plan" || draft.type === "unlock_lift_plan") return executeLiftPlanLock(supabase, user, draft, reason);
  if (draft.type === "archive_record") return executeArchiveRestore(supabase, user, draft, true, reason);
  if (draft.type === "restore_record") return executeArchiveRestore(supabase, user, draft, false, reason);

  throw new Error("This action is not supported yet.");
}

async function assertOfficeAccess() {
  const access = await getAccessContext();
  if (!access.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (access.role === "operator" || !access.role) return NextResponse.json({ error: "CRM Assistant is only available to office/admin users." }, { status: 403 });
  return null;
}

export async function POST(req: Request) {
  try {
    const accessError = await assertOfficeAccess();
    if (accessError) return accessError;

    const { supabase, user, response } = await requireApiUser();
    if (response) return response;

    const body = await req.json().catch(() => ({}));

    if (body?.mode === "execute") {
      const result = await executeDraft(supabase, user, body?.draftAction ?? null, body);
      return responseJson({ mode: "executed", title: result.title, message: result.message, open_href: result.href, results: [result.result] });
    }

    const command = clean(body?.command);
    if (!command) return responseJson({ error: "Command is required." }, 400);

    if (isLikelySupportQuestion(command)) {
      return handleSupportQuestion(command);
    }

    const parsed = (await parseWithOpenAI(command)) ?? fallbackParseCommand(command);

    if (parsed.action === "help") return helpResponse();
    if (parsed.action === "navigate") return handleNavigate(parsed);
    if (parsed.action === "open_job") return handleOpenJob(supabase, parsed, "job");
    if (parsed.action === "open_transport_job") return handleOpenTransportJob(supabase, parsed);
    if (parsed.action === "open_lift_plan") return handleOpenJob(supabase, parsed, "lift_plan");
    if (parsed.action === "open_lift_plan_pack") return handleOpenJob(supabase, parsed, "pack");
    if (parsed.action === "open_customer") return handleOpenCustomer(supabase, parsed);
    if (parsed.action === "check_job_missing_info") return handleMissingInfo(supabase, parsed);
    if (parsed.action === "create_customer_draft") return handleCreateCustomerDraft(parsed);
    if (parsed.action === "create_supplier_draft") return handleCreateSupplierDraft(parsed);
    if (parsed.action === "create_operator_draft") return handleCreateOperatorDraft(parsed);
    if (parsed.action === "create_crane_draft") return handleCreateCraneDraft(parsed);
    if (parsed.action === "create_vehicle_draft") return handleCreateVehicleDraft(parsed);
    if (parsed.action === "create_crane_job_draft") return handleCreateCraneJobDraft(supabase, parsed, command);
    if (parsed.action === "create_transport_job_draft") return handleCreateTransportJobDraft(supabase, parsed, command);
    if (parsed.action === "move_job_draft") return handleMoveJobDraft(supabase, parsed);
    if (parsed.action === "move_transport_job_draft") return handleMoveTransportDraft(supabase, parsed);
    if (parsed.action === "assign_operator_draft") return handleAssignOperatorDraft(supabase, parsed);
    if (parsed.action === "assign_crane_draft") return handleAssignCraneDraft(supabase, parsed);
    if (parsed.action === "assign_vehicle_draft") return handleAssignVehicleDraft(supabase, parsed);
    if (parsed.action === "update_job_status_draft") return handleStatusDraft(supabase, parsed, false);
    if (parsed.action === "update_transport_status_draft") return handleStatusDraft(supabase, parsed, true);
    if (parsed.action === "update_invoice_status_draft") return handleInvoiceStatusDraft(supabase, parsed);
    if (parsed.action === "mark_visit_invoiced_draft") return handleVisitInvoiceDraft(supabase, parsed);
    if (parsed.action === "add_note_draft") return handleAddNoteDraft(supabase, parsed);
    if (parsed.action === "update_site_draft") return handleUpdateSiteDraft(supabase, parsed);
    if (parsed.action === "cancel_record_draft") return handleCancelDraft(supabase, parsed);
    if (parsed.action === "lock_lift_plan_draft") return handleLiftPlanLockDraft(supabase, parsed, false);
    if (parsed.action === "unlock_lift_plan_draft") return handleLiftPlanLockDraft(supabase, parsed, true);

    const href = pageHref(parsed.page_name ?? parsed.search_query, parsed);
    if (href) return handleNavigate({ ...parsed, page_name: parsed.page_name ?? parsed.search_query });

    // Final safety net: if it looks like a CRM workflow/help phrase but did not match a command, answer as support rather than asking odd follow-up questions.
    if (supportKeywords(command).length || isLikelySupportQuestion(command)) return handleSupportQuestion(command);

    return handleSearch(supabase, parsed, command);
  } catch (e: any) {
    return responseJson({ error: e?.message ?? "CRM Assistant failed." }, 400);
  }
}
