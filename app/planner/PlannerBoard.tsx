"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PlannerDay = {
  date: string;
  label: string;
  is_bank_holiday?: boolean;
  bank_holiday_label?: string | null;
};

type VisitInvoiceEntry = {
  id?: string | null;
  job_id?: string | null;
  visit_date?: string | null;
  invoice_status?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  notes?: string | null;
};

type PlannerItem = {
  id: string;
  allocation_id?: string | null;
  allocation_source?: string | null;
  job_id: string;
  job_number?: number | string | null;
  job_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  invoice_status?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  operator_id?: string | null;
  equipment_id?: string | null;
  source_type?: string | null;
  item_name?: string | null;
  clients?: any;
  operators?: any;
  equipment?: any;
  agreed_sell_rate?: number | null;
  supplier_id?: string | null;
  supplier_reference?: string | null;
  supplier_cost?: number | null;
  price_mode?: string | null;
  price_per_day?: number | null;
  job_price?: number | null;
  exclude_weekends?: boolean;
  working_dates?: string[];
  billable_days?: number | null;
  notes?: string | null;
  linked_transport_job_count?: number | null;
  linked_transport_numbers?: string[] | null;
  lift_plan_status?: string | null;
  planner_group?: string | null;
  visit_invoices?: Record<string, VisitInvoiceEntry>;
};

type PlannerPerson = {
  id: string;
  full_name?: string | null;
};

type AssetAvailabilityEntry = {
  id: string;
  asset_type?: "crane" | "vehicle" | string;
  asset_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  notes?: string | null;
  blocks_assignment?: boolean | null;
};

type PlannerEquipment = {
  id: string;
  name?: string | null;
  asset_number?: string | null;
  availability?: AssetAvailabilityEntry[];
};

type PlannerResponse = {
  week_start: string;
  week_end: string;
  days: PlannerDay[];
  bank_holidays?: Array<{ date: string; label: string }>;
  items: PlannerItem[];
  operators: PlannerPerson[];
  equipment: PlannerEquipment[];
};

type DropTarget = {
  equipmentId: string | null;
  dayIso: string;
  plannerGroup?: string | null;
};

type PlannerViewMode = "rolling_7_days" | "current_week";

const DEFAULT_PLANNER_VIEW_MODE: PlannerViewMode = "rolling_7_days";
const PLANNER_VIEW_LABELS: Record<PlannerViewMode, string> = {
  rolling_7_days: "Rolling 7 days",
  current_week: "Current week",
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function mondayOf(base: Date) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isoDateLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function plannerStartForMode(mode: PlannerViewMode, base = new Date()) {
  if (mode === "current_week") return isoDateLocal(mondayOf(base));
  return isoDateLocal(base);
}

function normalisePlannerViewMode(value: unknown): PlannerViewMode {
  return value === "current_week" || value === "rolling_7_days"
    ? value
    : DEFAULT_PLANNER_VIEW_MODE;
}

function queryDateOverride() {
  if (typeof window === "undefined") return "";
  const value = new URLSearchParams(window.location.search).get("date") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function itemMatchesDay(item: PlannerItem, dayIso: string) {
  const workingDates = Array.isArray(item.working_dates) ? item.working_dates : [];
  if (workingDates.length > 0) {
    return workingDates.includes(dayIso);
  }

  const start = String(item.start_date ?? item.job_date ?? "").trim();
  const end = String(item.end_date ?? item.start_date ?? item.job_date ?? "").trim();
  if (!start || !end) return false;

  return start <= dayIso && end >= dayIso;
}

function availabilityMatchesDay(entry: AssetAvailabilityEntry, dayIso: string) {
  const start = String(entry.start_date ?? "").trim();
  const end = String(entry.end_date ?? entry.start_date ?? "").trim();
  if (!start || !end) return false;
  return start <= dayIso && end >= dayIso;
}

function assetAvailabilityStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "mot") return "MOT";
  if (raw === "maintenance") return "Maintenance";
  if (raw === "service") return "Service";
  if (raw === "inspection") return "Inspection";
  if (raw === "repair") return "Repair";
  if (raw === "breakdown") return "Breakdown";
  if (raw === "unavailable") return "Unavailable";
  if (raw === "other") return "Other";
  return raw ? raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Unavailable";
}

function availabilityTimeLabel(entry: AssetAvailabilityEntry) {
  const start = String(entry.start_time ?? "").trim();
  const end = String(entry.end_time ?? "").trim();
  return start && end ? `${start}-${end}` : "";
}

function availabilityEntriesForDay(equipment: PlannerEquipment, dayIso: string) {
  return (equipment.availability ?? []).filter((entry) => availabilityMatchesDay(entry, dayIso));
}

function availabilityBlocksAssignment(entries: AssetAvailabilityEntry[]) {
  return entries.some((entry) => entry.blocks_assignment !== false);
}

function getClientName(item: PlannerItem) {
  const client = first(item.clients);
  return (client as any)?.company_name ?? "No customer";
}

function getOperatorName(item: PlannerItem) {
  const operator = first(item.operators);
  return (operator as any)?.full_name ?? "Unassigned";
}

function getEquipmentName(item: PlannerItem) {
  const equipment = first(item.equipment);
  return (equipment as any)?.name ?? "No crane";
}

function isPerDayPriced(item: PlannerItem) {
  return String(item.price_mode ?? "full_job").trim().toLowerCase() === "per_day";
}

function getDisplayPrice(item: PlannerItem) {
  const agreed = Number(item.agreed_sell_rate ?? 0);
  if (Number.isFinite(agreed) && agreed > 0) return agreed;

  if (isPerDayPriced(item)) {
    const dayRate = Number(item.price_per_day ?? 0);
    if (Number.isFinite(dayRate) && dayRate > 0) return dayRate;
  }

  return Number(item.job_price ?? 0);
}

function priceDisplaySuffix(item: PlannerItem) {
  if (isPerDayPriced(item)) return " • Per day";
  return " • Full job";
}

function isCrossHireItem(item: PlannerItem) {
  return String(item.source_type ?? "").trim().toLowerCase() === "cross_hire" || String(item.planner_group ?? "") === "cross_hired";
}

function isLabourOnlyItem(item: PlannerItem) {
  return String(item.planner_group ?? "") === "labour_only";
}

function linkedTransportCount(item: PlannerItem) {
  const count = Number(item.linked_transport_job_count ?? 0);
  return Number.isFinite(count) ? Math.max(count, 0) : 0;
}

function isLinkedTransportItem(item: PlannerItem) {
  return linkedTransportCount(item) > 0;
}

function getLinkedTransportLabel(item: PlannerItem) {
  const count = linkedTransportCount(item);
  if (count <= 1) return "Linked transport";
  return `Linked transport x${count}`;
}

function getLiftPlanLabel(status: string | null | undefined) {
  const key = String(status ?? "").trim().toLowerCase();

  if (key === "lp locked" || key === "locked") return "LP locked";
  if (key === "lp draft" || key === "draft") return "LP draft";
  if (key === "lp required" || key === "required") return "LP required";

  return null;
}

function getLiftPlanPillStyle(status: string | null | undefined): React.CSSProperties {
  const key = String(status ?? "").trim().toLowerCase();

  if (key === "lp locked" || key === "locked") {
    return {
      background: "rgba(0,160,80,0.14)",
      color: "#0b6b34",
      border: "1px solid rgba(0,160,80,0.18)",
    };
  }

  if (key === "lp draft" || key === "draft") {
    return {
      background: "rgba(255,140,0,0.14)",
      color: "#8a5609",
      border: "1px solid rgba(255,140,0,0.20)",
    };
  }

  if (key === "lp required" || key === "required") {
    return {
      background: "rgba(180,0,0,0.10)",
      color: "#8b0000",
      border: "1px solid rgba(180,0,0,0.18)",
    };
  }

  return {
    background: "rgba(0,0,0,0.06)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

function getPlannerCardHighlightStyle(item: PlannerItem, compact = false): React.CSSProperties {
  const baseShadow = compact ? "0 4px 12px rgba(0,0,0,0.05)" : "0 4px 14px rgba(0,0,0,0.06)";

  if (isCrossHireItem(item)) {
    return {
      background: "rgba(246, 198, 117, 0.26)",
      border: "1px solid rgba(214,137,16,0.34)",
      outline: "2px solid rgba(214,137,16,0.24)",
      outlineOffset: -2,
      boxShadow: `inset 4px 0 0 #d68910, ${baseShadow}`,
    };
  }

  if (isLabourOnlyItem(item)) {
    return {
      background: "rgba(183, 146, 208, 0.22)",
      border: "1px solid rgba(125,60,152,0.28)",
      outline: "2px solid rgba(125,60,152,0.22)",
      outlineOffset: -2,
      boxShadow: `inset 4px 0 0 #7d3c98, ${baseShadow}`,
    };
  }

  if (isLinkedTransportItem(item)) {
    return {
      background: "rgba(116, 182, 255, 0.22)",
      border: "1px solid rgba(0,120,255,0.24)",
      outline: "2px solid rgba(0,120,255,0.18)",
      outlineOffset: -2,
      boxShadow: `inset 4px 0 0 #0078ff, ${baseShadow}`,
    };
  }

  return { boxShadow: baseShadow };
}

function sortItemsByStartTime(items: PlannerItem[]) {
  return [...items].sort((a, b) => {
    const at = String(a.start_time ?? "99:99");
    const bt = String(b.start_time ?? "99:99");
    if (at !== bt) return at.localeCompare(bt);
    const an = Number(a.job_number ?? 0);
    const bn = Number(b.job_number ?? 0);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return String(a.id).localeCompare(String(b.id));
  });
}

function getStatusTone(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "confirmed") {
    return {
      background: "rgba(0,120,255,0.12)",
      border: "1px solid rgba(0,120,255,0.18)",
    };
  }

  if (s === "in_progress") {
    return {
      background: "rgba(255,140,0,0.16)",
      border: "1px solid rgba(255,140,0,0.20)",
    };
  }

  if (s === "completed") {
    return {
      background: "rgba(0,180,120,0.14)",
      border: "1px solid rgba(0,180,120,0.18)",
    };
  }

  if (s === "late_cancelled") {
    return {
      background: "rgba(255,0,0,0.10)",
      border: "1px solid rgba(255,0,0,0.18)",
    };
  }

  if (s === "cancelled") {
    return {
      background: "rgba(160,160,160,0.10)",
      border: "1px solid rgba(160,160,160,0.18)",
    };
  }

  return {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

function formatDateRange(item: PlannerItem) {
  const start = String(item.start_date ?? item.job_date ?? "").trim();
  const end = String(item.end_date ?? item.start_date ?? item.job_date ?? "").trim();
  if (!start && !end) return "No dates";
  if (start && end && start === end) return start;
  return `${start || "—"} → ${end || "—"}`;
}

function formatWorkingDays(item: PlannerItem) {
  const dates = Array.isArray(item.working_dates) ? item.working_dates : [];
  if (dates.length === 0) return "No working days";
  if (dates.length === 1) return dates[0];
  return `${dates[0]} → ${dates[dates.length - 1]} • ${dates.length} day${dates.length === 1 ? "" : "s"}`;
}

function shiftedEndDateByDays(
  newStartIso: string,
  billableDays: number,
  excludeWeekends: boolean
) {
  const start = parseDateOnly(newStartIso);
  if (!start) return newStartIso;

  const cursor = new Date(start);
  let counted = 1;
  const totalDays = Math.max(billableDays, 1);

  while (counted < totalDays) {
    cursor.setDate(cursor.getDate() + 1);
    if (!excludeWeekends || !isWeekend(cursor)) {
      counted += 1;
    }
  }

  return isoDateLocal(cursor);
}

function segmentBillableDays(item: PlannerItem, sourceDayIso: string) {
  const explicitDates = Array.isArray(item.working_dates) ? item.working_dates : [];
  if (explicitDates.length > 0) {
    const count = explicitDates.filter((date) => date >= sourceDayIso).length;
    return Math.max(count, 1);
  }

  const endIso = String(item.end_date ?? item.start_date ?? item.job_date ?? "").trim();
  const start = parseDateOnly(sourceDayIso);
  const end = parseDateOnly(endIso);

  if (!start || !end) {
    return Math.max(Number(item.billable_days ?? 0), 1);
  }

  const cursor = new Date(start);
  let count = 0;

  while (cursor <= end) {
    if (!item.exclude_weekends || !isWeekend(cursor)) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.max(count, 1);
}

function actionLabel(item: PlannerItem) {
  return `Job ${item.job_number ? `#${item.job_number}` : ""} • ${getClientName(item)}`;
}

function canDragPlannerItem(item: PlannerItem) {
  return String(item.status ?? "").trim().toLowerCase() !== "completed";
}

function isNoDragTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[data-no-drag='true']"));
}

function stopNoDragEvent() {}

export default function PlannerBoard() {
  const [plannerViewMode, setPlannerViewMode] = useState<PlannerViewMode>(DEFAULT_PLANNER_VIEW_MODE);
  const [preferenceLoading, setPreferenceLoading] = useState(true);
  const [preferenceError, setPreferenceError] = useState("");
  const [weekStart, setWeekStart] = useState<string>(() => plannerStartForMode(DEFAULT_PLANNER_VIEW_MODE));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlannerResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDayIndex, setMobileDayIndex] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragSourceDay, setDragSourceDay] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [invoicingVisitKey, setInvoicingVisitKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const dragAutoScrollFrameRef = useRef<number | null>(null);

  async function loadBoard(targetWeekStart: string) {
    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch(`/api/planner/board?date=${encodeURIComponent(targetWeekStart)}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Could not load planner.");
      }

      setData(json);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load planner.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadPlannerPreference() {
      setPreferenceLoading(true);
      setPreferenceError("");

      try {
        const res = await fetch("/api/user-preferences/planner-view", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(json?.error || "Could not load planner view preference.");

        const nextMode = normalisePlannerViewMode(json?.planner_view_mode);
        const requestedDate = queryDateOverride();
        setPlannerViewMode(nextMode);
        setWeekStart(requestedDate || plannerStartForMode(nextMode));
      } catch (e: any) {
        setPreferenceError(e?.message || "Could not load planner view preference.");
        const requestedDate = queryDateOverride();
        setPlannerViewMode(DEFAULT_PLANNER_VIEW_MODE);
        setWeekStart(requestedDate || plannerStartForMode(DEFAULT_PLANNER_VIEW_MODE));
      } finally {
        setPreferenceLoading(false);
      }
    }

    loadPlannerPreference();
  }, []);

  useEffect(() => {
    if (!preferenceLoading) loadBoard(weekStart);
  }, [weekStart, preferenceLoading]);

  useEffect(() => {
    function syncMobile() {
      setIsMobile(window.innerWidth < 900);
    }

    syncMobile();
    window.addEventListener("resize", syncMobile);
    return () => window.removeEventListener("resize", syncMobile);
  }, []);

  useEffect(() => {
    if (!draggingId) {
      dragPointerYRef.current = null;
      if (dragAutoScrollFrameRef.current) {
        window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
        dragAutoScrollFrameRef.current = null;
      }
      return;
    }

    const updatePointer = (event: DragEvent) => {
      dragPointerYRef.current = event.clientY;
    };

    const clearPointer = () => {
      dragPointerYRef.current = null;
    };

    const tick = () => {
      const pointerY = dragPointerYRef.current;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

      if (typeof pointerY === "number" && viewportHeight > 0) {
        const edgeThreshold = Math.min(180, Math.max(90, Math.round(viewportHeight * 0.18)));
        const upperEdge = edgeThreshold;
        const lowerEdge = viewportHeight - edgeThreshold;
        let delta = 0;

        if (pointerY < upperEdge) {
          const ratio = (upperEdge - pointerY) / Math.max(upperEdge, 1);
          delta = -Math.max(10, Math.round(ratio * 26));
        } else if (pointerY > lowerEdge) {
          const ratio = (pointerY - lowerEdge) / Math.max(edgeThreshold, 1);
          delta = Math.max(10, Math.round(ratio * 26));
        }

        if (delta !== 0) {
          window.scrollBy({ top: delta, behavior: "auto" });
        }
      }

      dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    document.addEventListener("dragover", updatePointer, true);
    document.addEventListener("drop", clearPointer, true);
    document.addEventListener("dragend", clearPointer, true);
    dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      document.removeEventListener("dragover", updatePointer, true);
      document.removeEventListener("drop", clearPointer, true);
      document.removeEventListener("dragend", clearPointer, true);
      dragPointerYRef.current = null;
      if (dragAutoScrollFrameRef.current) {
        window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
        dragAutoScrollFrameRef.current = null;
      }
    };
  }, [draggingId]);

  useEffect(() => {
    function onDocPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-planner-menu-root=\"true\"]")) return;
      setOpenMenuId(null);
    }

    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, []);

  const visibleDays = useMemo(() => {
    if (data?.days?.length) return data.days;

    const base = new Date(`${weekStart}T00:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      return {
        date: isoDateLocal(d),
        label: d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
        is_bank_holiday: false,
        bank_holiday_label: null,
      };
    });
  }, [data, weekStart]);

  useEffect(() => {
    if (!visibleDays.length) {
      setMobileDayIndex(0);
      return;
    }

    const today = isoDateLocal(new Date());
    const idx = visibleDays.findIndex((day) => day.date === today);
    setMobileDayIndex((current) => {
      if (current >= 0 && current < visibleDays.length) return current;
      return idx >= 0 ? idx : 0;
    });
  }, [weekStart, visibleDays.length]);

  const activeDay = visibleDays[Math.min(mobileDayIndex, Math.max(visibleDays.length - 1, 0))] ?? null;

  const groupedByEquipment = useMemo(() => {
    const equipmentList = data?.equipment ?? [];
    const items = data?.items ?? [];

    return equipmentList.map((equipment) => {
      const equipmentItems = items.filter((item) => String(item.equipment_id ?? "") === equipment.id);
      return {
        equipment,
        items: equipmentItems,
      };
    });
  }, [data]);

  const crossHiredItems = useMemo(() => {
    return (data?.items ?? []).filter(
      (item) => !item.equipment_id && String(item.planner_group ?? "") === "cross_hired"
    );
  }, [data]);

  const unassignedCraneItems = useMemo(() => {
    return (data?.items ?? []).filter(
      (item) =>
        !item.equipment_id &&
        String(item.planner_group ?? "") !== "labour_only" &&
        String(item.planner_group ?? "") !== "cross_hired"
    );
  }, [data]);

  const labourOnlyItems = useMemo(() => {
    return (data?.items ?? []).filter(
      (item) => !item.equipment_id && String(item.planner_group ?? "") === "labour_only"
    );
  }, [data]);

  function moveWeek(delta: number) {
    const base = new Date(`${weekStart}T00:00:00`);
    setWeekStart(isoDateLocal(addDays(base, delta * 7)));
  }

  function jumpToCurrentWindow() {
    setWeekStart(plannerStartForMode(plannerViewMode));
  }

  async function savePlannerViewMode(nextMode: PlannerViewMode) {
    const safeMode = normalisePlannerViewMode(nextMode);
    setPlannerViewMode(safeMode);
    setWeekStart(plannerStartForMode(safeMode));
    setPreferenceError("");

    try {
      const res = await fetch("/api/user-preferences/planner-view", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planner_view_mode: safeMode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not save planner view preference.");
      showMessage(`Planner view saved: ${PLANNER_VIEW_LABELS[safeMode]}.`);
    } catch (e: any) {
      setPreferenceError(e?.message || "Could not save planner view preference.");
    }
  }

  function moveMobileDay(delta: number) {
    setMobileDayIndex((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next > visibleDays.length - 1) return visibleDays.length - 1;
      return next;
    });
  }

  function showMessage(next: string) {
    setMessage(next);
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = window.setTimeout(() => setMessage(""), 2500);
  }

  function getVisitInvoiceEntry(item: PlannerItem, dayIso?: string | null) {
    if (!dayIso) return null;

    const parentStatus = String(item.invoice_status ?? "Not Invoiced").trim();
    const parentIsInvoiced = parentStatus && parentStatus.toLowerCase() !== "not invoiced";

    // Full-job-price crane jobs must use the parent job invoice status as the source of truth.
    // Per-day jobs can still use individual visit invoice rows.
    if (!isPerDayPriced(item)) {
      return parentIsInvoiced
        ? {
            job_id: item.job_id,
            visit_date: dayIso,
            invoice_status: parentStatus,
            notes: "Shown from the main job invoice status.",
          }
        : null;
    }

    const explicitEntry = item.visit_invoices?.[dayIso] ?? null;
    if (explicitEntry) return explicitEntry;

    return parentIsInvoiced
      ? {
          job_id: item.job_id,
          visit_date: dayIso,
          invoice_status: parentStatus,
          notes: "Shown from the main job invoice status.",
        }
      : null;
  }

  function visitIsInvoiced(entry: VisitInvoiceEntry | null) {
    const status = String(entry?.invoice_status ?? "").trim().toLowerCase();
    return status === "invoiced" || status === "part paid" || status === "paid";
  }

  async function setVisitInvoiceStatus(item: PlannerItem, dayIso: string, nextStatus: "Not Invoiced" | "Invoiced") {
    const key = `${item.job_id}:${dayIso}`;
    setInvoicingVisitKey(key);
    setActionError("");
    setMessage("");

    try {
      const res = await fetch("/api/planner/visit-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: item.job_id,
          visit_date: dayIso,
          invoice_status: nextStatus,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not update visit invoice status.");

      await loadBoard(weekStart);
      showMessage(nextStatus === "Invoiced" ? "Visit marked as invoiced." : "Visit marked as not invoiced.");
    } catch (e: any) {
      setActionError(e?.message || "Could not update visit invoice status.");
    } finally {
      setInvoicingVisitKey(null);
    }
  }

  async function movePlannerItem(
    item: PlannerItem,
    target: DropTarget,
    sourceDayOverride?: string | null
  ) {
    if (movingId) return;

    const sourceDay =
      String(
        sourceDayOverride ??
          dragSourceDay ??
          item.start_date ??
          item.job_date ??
          target.dayIso
      ).trim() || target.dayIso;
    const segmentDays = segmentBillableDays(item, sourceDay);
    const nextStart = target.dayIso;
    const nextEnd = shiftedEndDateByDays(nextStart, segmentDays, Boolean(item.exclude_weekends));
    const nextEquipmentId = target.equipmentId;
    const sourceSegmentEnd =
      Array.isArray(item.working_dates) && item.working_dates.length > 0
        ? item.working_dates[item.working_dates.length - 1]
        : String(item.end_date ?? item.start_date ?? item.job_date ?? sourceDay).trim();

    const currentPlannerGroup = String(item.planner_group ?? "").trim();
    const nextPlannerGroup = String(target.plannerGroup ?? currentPlannerGroup).trim();
    const movingToCrossHire = nextPlannerGroup === "cross_hired";
    const hasCrossHireMeta = Boolean(
      String(item.supplier_id ?? "").trim() ||
      String(item.supplier_reference ?? "").trim() ||
      Number(item.supplier_cost ?? 0) > 0 ||
      String(item.source_type ?? "").trim().toLowerCase() === "cross_hire" ||
      currentPlannerGroup === "cross_hired"
    );

    const alreadySame =
      String(item.equipment_id ?? "") === String(nextEquipmentId ?? "") &&
      sourceDay === nextStart &&
      String(sourceSegmentEnd ?? "") === nextEnd &&
      currentPlannerGroup === nextPlannerGroup;

    if (alreadySame) {
      setDraggingId(null);
      setDragSourceDay(null);
      return;
    }

    if (movingToCrossHire && !hasCrossHireMeta) {
      window.location.href = `/jobs/${item.job_id}`;
      return;
    }

    setMovingId(item.id);
    setOpenMenuId(null);
    setActionError("");

    try {
      const res = await fetch("/api/planner/board/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allocation_id: item.allocation_id ?? null,
          allocation_source: item.allocation_source ?? null,
          job_id: item.job_id,
          equipment_id: nextEquipmentId ?? "",
          operator_id: item.operator_id ?? "",
          source_day: sourceDay,
          job_date: nextStart,
          start_date: nextStart,
          end_date: nextEnd,
          start_time: item.start_time ?? "",
          end_time: item.end_time ?? "",
          status: item.status ?? "",
          planner_group: item.planner_group ?? "",
          target_planner_group: target.plannerGroup ?? null,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Could not move planner item.");
      }

      showMessage("Planner updated.");
      await loadBoard(weekStart);
    } catch (e: any) {
      setActionError(e?.message || "Could not move planner item.");
    } finally {
      setMovingId(null);
      setDraggingId(null);
      setDragSourceDay(null);
    }
  }

  async function duplicateJob(item: PlannerItem) {
    setOpenMenuId(null);
    setActionError("");

    try {
      const res = await fetch("/api/jobs/duplicate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: item.job_id,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Could not duplicate job.");
      }

      const newId = String(json?.job?.id ?? "").trim();
      if (newId) {
        window.location.href = `/jobs/${newId}`;
        return;
      }

      showMessage("Job duplicated.");
      await loadBoard(weekStart);
    } catch (e: any) {
      setActionError(e?.message || "Could not duplicate job.");
    }
  }

  async function createTransport(item: PlannerItem) {
    setOpenMenuId(null);
    setActionError("");

    try {
      const res = await fetch("/api/jobs/create-transport", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: item.job_id,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Could not create linked transport job.");
      }

      const newId = String(json?.job?.id ?? "").trim();
      if (newId) {
        window.location.href = `/transport-jobs/${newId}`;
        return;
      }

      showMessage("Linked transport job created.");
    } catch (e: any) {
      setActionError(e?.message || "Could not create linked transport job.");
    }
  }

  function onDragStart(
    e: React.DragEvent<HTMLDivElement>,
    item: PlannerItem,
    visibleDayIso?: string | null
  ) {
    if (isNoDragTarget(e.target)) {
      e.preventDefault();
      return;
    }
    setDraggingId(item.id);
    dragPointerYRef.current = e.clientY;
    setDragSourceDay(
      String(visibleDayIso ?? item.start_date ?? item.job_date ?? "").trim() || null
    );
    setOpenMenuId(null);
  }

  function onDragEnd() {
    dragPointerYRef.current = null;
    setDraggingId(null);
    setDragSourceDay(null);
  }

  function renderMenu(item: PlannerItem) {
    const isOpen = openMenuId === item.id;

    function goTo(url: string) {
      window.location.href = url;
    }

    function noDragClick(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
    }

    function noDragDown(e: React.MouseEvent | React.PointerEvent) {
      e.stopPropagation();
    }

    return (
      <div
        data-no-drag="true"
        data-planner-menu-root="true"
        style={menuWrap}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={noDragDown}
        onPointerDown={noDragDown}
      >
        <button
          type="button"
          data-no-drag="true"
          style={menuBtn}
          onMouseDown={noDragDown}
          onPointerDown={noDragDown}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpenMenuId((current) => (current === item.id ? null : item.id));
          }}
        >
          ⋯
        </button>

        {isOpen ? (
          <div
            data-no-drag="true"
            style={menuList}
            onMouseDown={noDragDown}
            onPointerDown={noDragDown}
          >
            <button type="button" data-no-drag="true" style={menuItemBtn} onMouseDown={noDragDown} onPointerDown={noDragDown} onClick={(e) => { noDragClick(e); goTo(`/jobs/${item.job_id}`); }}>
              Open job
            </button>
            <button type="button" data-no-drag="true" style={menuItemBtn} onMouseDown={noDragDown} onPointerDown={noDragDown} onClick={(e) => { noDragClick(e); goTo(`/jobs/${item.job_id}/edit`); }}>
              Edit job
            </button>
            <button type="button" data-no-drag="true" style={menuItemBtn} onMouseDown={noDragDown} onPointerDown={noDragDown} onClick={(e) => { noDragClick(e); duplicateJob(item); }}>
              Duplicate job
            </button>
            <button type="button" data-no-drag="true" style={menuItemBtn} onMouseDown={noDragDown} onPointerDown={noDragDown} onClick={(e) => { noDragClick(e); createTransport(item); }}>
              Create transport job
            </button>
            {item.equipment_id ? (
              <button
                type="button"
                data-no-drag="true"
                style={menuItemBtn}
                onMouseDown={noDragDown}
                onPointerDown={noDragDown}
                onClick={(e) => {
                  noDragClick(e);
                  movePlannerItem(
                    item,
                    {
                      equipmentId: null,
                      dayIso: String(item.start_date ?? item.job_date ?? visibleDays[0]?.date ?? weekStart),
                      plannerGroup: "unassigned_crane",
                    },
                    String(item.start_date ?? item.job_date ?? visibleDays[0]?.date ?? weekStart)
                  );
                }}
              >
                Remove crane assignment
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderCard(item: PlannerItem, compact = false, visibleDayIso?: string | null) {
    const crossHireItem = isCrossHireItem(item);
    const labourOnlyItem = isLabourOnlyItem(item);
    const linkedTransportItem = isLinkedTransportItem(item);
    const linkedTransportLabel = linkedTransportItem ? getLinkedTransportLabel(item) : null;
    const liftPlanLabel = getLiftPlanLabel(item.lift_plan_status);
    const displayPrice = getDisplayPrice(item);
    const visitInvoiceEntry = getVisitInvoiceEntry(item, visibleDayIso);
    const visitInvoiced = visitIsInvoiced(visitInvoiceEntry);
    const visitInvoiceKey = visibleDayIso ? `${item.job_id}:${visibleDayIso}` : null;

    function stopVisitInvoiceDown(e: React.MouseEvent | React.PointerEvent) {
      e.stopPropagation();
    }

    function handleVisitInvoiceClick(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (!visibleDayIso) return;
      setVisitInvoiceStatus(item, visibleDayIso, visitInvoiced ? "Not Invoiced" : "Invoiced");
    }

    return (
      <div
        key={item.id}
        draggable={canDragPlannerItem(item) && openMenuId !== item.id && movingId !== item.id}
        onMouseDownCapture={stopNoDragEvent}
        onPointerDownCapture={stopNoDragEvent}
        onDragStart={(e) => onDragStart(e, item, visibleDayIso)}
        onDragEnd={onDragEnd}
        style={{
          ...(compact ? miniJobCard : fullJobCard),
          ...getStatusTone(item.status),
          ...getPlannerCardHighlightStyle(item, compact),
          opacity: draggingId === item.id ? 0.55 : movingId === item.id ? 0.45 : 1,
          cursor:
            movingId === item.id
              ? "wait"
              : !canDragPlannerItem(item) || openMenuId === item.id
              ? "default"
              : "grab",
        }}
        title={actionLabel(item)}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 1000 }}>
              Job {item.job_number ? `#${item.job_number}` : ""}
            </div>
            <div style={{ marginTop: 4, fontSize: compact ? 12 : 13, opacity: 0.85 }}>
              {getClientName(item)}
            </div>
          </div>
          {renderMenu(item)}
        </div>

        <div style={{ marginTop: 6, fontSize: compact ? 11 : 12, opacity: 0.82 }}>
          {item.site_name ?? item.site_address ?? "No site"}
        </div>

        <div style={{ marginTop: 6, fontSize: compact ? 11 : 12, opacity: 0.78 }}>
          {item.start_time ?? "—"} → {item.end_time ?? "—"}
        </div>

        {crossHireItem ? (
          <>
            <div style={{ marginTop: 6, fontSize: compact ? 11 : 12, fontWeight: 900 }}>
              PO cost {fmtMoney(item.supplier_cost ?? 0)}
            </div>
            <div style={{ marginTop: 2, fontSize: compact ? 11 : 12, fontWeight: 900 }}>
              Charge {fmtMoney(displayPrice)} ex VAT{priceDisplaySuffix(item)}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 6, fontSize: compact ? 11 : 12, fontWeight: 900 }}>
            {fmtMoney(displayPrice)} ex VAT{priceDisplaySuffix(item)}
          </div>
        )}

        {visibleDayIso ? (
          <div data-no-drag="true" style={visitInvoiceRow}>
            <span style={visitInvoiced ? visitInvoiceDonePill : visitInvoiceOpenPill}>
              {visitInvoiced ? "Visit invoiced" : "Visit not invoiced"}
              {visitInvoiceEntry?.invoice_number ? ` • ${visitInvoiceEntry.invoice_number}` : ""}
            </span>
            <button
              type="button"
              data-no-drag="true"
              style={visitInvoiced ? visitInvoiceUndoBtn : visitInvoiceBtn}
              disabled={invoicingVisitKey === visitInvoiceKey}
              onMouseDown={stopVisitInvoiceDown}
              onPointerDown={stopVisitInvoiceDown}
              onClick={handleVisitInvoiceClick}
            >
              {invoicingVisitKey === visitInvoiceKey ? "Saving…" : visitInvoiced ? "Undo" : "Mark invoiced"}
            </button>
          </div>
        ) : null}

        <div style={tagWrap}>
          {liftPlanLabel ? (
            <div style={{ ...pillNeutral, ...getLiftPlanPillStyle(item.lift_plan_status) }}>
              {liftPlanLabel}
            </div>
          ) : null}
          <div style={pillNeutral}>{getOperatorName(item)}</div>
          {labourOnlyItem ? <div style={pillLabour}>Labour only</div> : null}
          {crossHireItem ? <div style={pillCrossHire}>Cross hire / subcontract</div> : null}
          {linkedTransportLabel ? <div style={pillLinked}>{linkedTransportLabel}</div> : null}
          {item.item_name ? <div style={pillNeutral}>{item.item_name}</div> : null}
          {item.exclude_weekends ? <div style={pillNeutral}>Exclude weekends</div> : null}
        </div>
      </div>
    );
  }

  function renderAssetAvailability(entries: AssetAvailabilityEntry[]) {
    if (!entries.length) return null;

    return (
      <div style={assetAvailabilityWrap}>
        {entries.map((entry) => {
          const blocks = entry.blocks_assignment !== false;
          const timeText = availabilityTimeLabel(entry);
          return (
            <div key={entry.id} style={blocks ? assetUnavailableBadge : assetSoftUnavailableBadge}>
              <div style={{ fontWeight: 1000 }}>{assetAvailabilityStatusLabel(entry.status)}</div>
              <div style={{ marginTop: 2, fontSize: 11 }}>
                {blocks ? "Blocked" : "Note only"}
                {timeText ? ` • ${timeText}` : ""}
              </div>
              {entry.notes ? (
                <div style={{ marginTop: 2, fontSize: 11, opacity: 0.78 }}>{entry.notes}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDropCell(
    items: PlannerItem[],
    target: DropTarget,
    highlight = false,
    showEmptyCrossHire = false,
    crossHireSection = false,
    availabilityEntries: AssetAvailabilityEntry[] = []
  ) {
    const blockedByAvailability = availabilityBlocksAssignment(availabilityEntries);

    return (
      <div
        style={{
          ...dayCell,
          ...(crossHireSection ? crossHireDayCell : null),
          ...(highlight ? holidayCell : null),
          ...(availabilityEntries.length ? (blockedByAvailability ? assetUnavailableCell : assetSoftUnavailableCell) : null),
          ...(draggingId && !blockedByAvailability ? dropReadyCell : null),
        }}
        title={blockedByAvailability ? "This crane has downtime booked. Remove or unblock the downtime before assigning new work." : undefined}
        onDragOver={(e) => {
          if (blockedByAvailability) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          if (blockedByAvailability) return;
          e.preventDefault();
          const item = (data?.items ?? []).find((row) => row.id === draggingId);
          if (item) {
            movePlannerItem(item, target);
          }
        }}
      >
        {renderAssetAvailability(availabilityEntries)}
        {items.length > 0 ? (
          sortItemsByStartTime(items).map((item) => renderCard(item, true, target.dayIso))
        ) : showEmptyCrossHire ? (
          <div style={emptyCellText}>No cross-hired crane jobs</div>
        ) : availabilityEntries.length ? (
          <div style={emptyCellText}>No jobs</div>
        ) : (
          <div style={emptyCellText}>Free</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={toolbarStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28 }}>Crane Planner</h2>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Showing from {data?.week_start ?? weekStart} to {data?.week_end ?? visibleDays[visibleDays.length - 1]?.date ?? weekStart}
          </div>
          <div style={{ marginTop: 4, opacity: 0.72, fontSize: 13 }}>
            View mode: <strong>{PLANNER_VIEW_LABELS[plannerViewMode]}</strong>
            {preferenceLoading ? " • loading saved preference…" : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={viewToggleWrap} aria-label="Planner view mode">
            <button
              type="button"
              onClick={() => savePlannerViewMode("rolling_7_days")}
              style={plannerViewMode === "rolling_7_days" ? viewToggleActive : viewToggleBtn}
              disabled={preferenceLoading}
            >
              Rolling 7 days
            </button>
            <button
              type="button"
              onClick={() => savePlannerViewMode("current_week")}
              style={plannerViewMode === "current_week" ? viewToggleActive : viewToggleBtn}
              disabled={preferenceLoading}
            >
              Current week
            </button>
          </div>
          <a href="/jobs/new" style={primaryBtn}>
            + Add Job
          </a>
          <button type="button" onClick={() => moveWeek(-1)} style={secondaryBtn}>
            {plannerViewMode === "current_week" ? "← Previous week" : "← Previous 7 days"}
          </button>
          <button type="button" onClick={jumpToCurrentWindow} style={secondaryBtn}>
            {plannerViewMode === "current_week" ? "This week" : "Today"}
          </button>
          <button type="button" onClick={() => moveWeek(1)} style={secondaryBtn}>
            {plannerViewMode === "current_week" ? "Next week →" : "Next 7 days →"}
          </button>
        </div>
      </div>

      {isMobile && activeDay ? (
        <div style={mobileDayPickerWrap}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => moveMobileDay(-1)} style={secondaryBtn} disabled={mobileDayIndex === 0}>
              ← Prev day
            </button>
            <div style={activeDayPill}>
              <div style={{ fontWeight: 900 }}>{activeDay.label}</div>
              <div style={{ marginTop: 2, fontSize: 12, opacity: 0.75 }}>
                {activeDay.is_bank_holiday ? activeDay.bank_holiday_label ?? "Bank holiday" : activeDay.date}
              </div>
            </div>
            <button
              type="button"
              onClick={() => moveMobileDay(1)}
              style={secondaryBtn}
              disabled={mobileDayIndex === visibleDays.length - 1}
            >
              Next day →
            </button>
          </div>

          <div style={mobileDayTabs}>
            {visibleDays.map((day, index) => (
              <button
                key={day.date}
                type="button"
                onClick={() => setMobileDayIndex(index)}
                style={index === mobileDayIndex ? mobileTabActive : mobileTabBtn}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {preferenceError ? <div style={errorBox}>{preferenceError}</div> : null}
      {loading || preferenceLoading ? <div style={infoBox}>Loading planner…</div> : null}
      {loadError ? <div style={errorBox}>{loadError}</div> : null}
      {actionError ? <div style={errorBox}>{actionError}</div> : null}
      {message ? <div style={successBox}>{message}</div> : null}

      {!loading && !loadError ? (
        <>
          <section style={sectionCard}>
            <div style={sectionTitleRow}>
              <div>
                <div style={sectionTitle}>Unassigned crane jobs</div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                  Drag these onto a crane/day cell to allocate them.
                </div>
              </div>
            </div>

            <div
              style={{
                ...dropLane,
                ...(draggingId ? dropReadyCell : null),
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const item = (data?.items ?? []).find((row) => row.id === draggingId);
                if (item) {
                  movePlannerItem(
                    item,
                    {
                      equipmentId: null,
                      dayIso: String(item.start_date ?? item.job_date ?? visibleDays[0]?.date ?? weekStart),
                      plannerGroup: "unassigned_crane",
                    },
                    String(item.start_date ?? item.job_date ?? visibleDays[0]?.date ?? weekStart)
                  );
                }
              }}
            >
              {unassignedCraneItems.length > 0 ? (
                sortItemsByStartTime(unassignedCraneItems).map((item) => (
                  <div key={item.id} style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={pillWarn}>No crane assigned</div>
                      <div style={pillNeutral}>{formatDateRange(item)}</div>
                      <div style={pillNeutral}>{formatWorkingDays(item)}</div>
                    </div>
                    {renderCard(item, false, activeDay.date)}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 14, opacity: 0.75 }}>
                  No unassigned crane jobs for this week.
                </div>
              )}
            </div>
          </section>

          <section style={crossHireSectionCard}>
            <div style={sectionTitleRow}>
              <div>
                <div style={sectionTitle}>Cross-hired cranes</div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                  Supplier-fulfilled crane jobs kept separate from the owned crane rows.
                </div>
              </div>
            </div>

            {isMobile && activeDay ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={crossHireMobileHeader}>
                  <div style={{ fontWeight: 1000 }}>Cross-hired cranes</div>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>{activeDay.label}</div>
                </div>
                {renderDropCell(
                  sortItemsByStartTime(
                    crossHiredItems.filter((item) => itemMatchesDay(item, activeDay.date))
                  ),
                  { equipmentId: null, dayIso: activeDay.date, plannerGroup: "cross_hired" },
                  activeDay.is_bank_holiday,
                  true,
                  true
                )}
              </div>
            ) : (
              <div style={desktopGrid(visibleDays.length)}>
                <div style={crossHireHeadCell}>Cross-hire / Week</div>

                {visibleDays.map((day) => (
                  <div
                    key={`cross-hire-head-${day.date}`}
                    style={{
                      ...crossHireHeadCell,
                      ...(day.is_bank_holiday ? holidayHeaderCell : null),
                    }}
                  >
                    <div>{day.label}</div>
                    {day.is_bank_holiday ? (
                      <div style={{ marginTop: 2, fontSize: 11, opacity: 0.8 }}>
                        {day.bank_holiday_label ?? "Bank holiday"}
                      </div>
                    ) : null}
                  </div>
                ))}

                <div style={crossHireRowHeaderCell}>Cross hired</div>

                {visibleDays.map((day) => {
                  const dayItems = sortItemsByStartTime(
                    crossHiredItems.filter((item) => itemMatchesDay(item, day.date))
                  );

                  return renderDropCell(
                    dayItems,
                    { equipmentId: null, dayIso: day.date, plannerGroup: "cross_hired" },
                    day.is_bank_holiday,
                    true,
                    true
                  );
                })}
              </div>
            )}
          </section>

          {labourOnlyItems.length > 0 ? (
            <section style={sectionCard}>
              <div style={sectionTitleRow}>
                <div>
                  <div style={sectionTitle}>Labour only / no lifting asset</div>
                  <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                    Day-by-day labour view
                  </div>
                </div>
              </div>

              {isMobile && activeDay ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={mobileRowHeader}>
                    <div style={{ fontWeight: 1000 }}>Labour only</div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>{activeDay.label}</div>
                  </div>
                  <div style={mobileDayCell}>
                    {sortItemsByStartTime(
                      labourOnlyItems.filter((item) => itemMatchesDay(item, activeDay.date))
                    ).map((item) => (
                      <div key={`${item.id}-${activeDay.date}`} style={{ display: "grid", gap: 8 }}>
                        <div style={pillLabour}>Labour only</div>
                        {renderCard(item, false, activeDay.date)}
                      </div>
                    ))}
                    {sortItemsByStartTime(
                      labourOnlyItems.filter((item) => itemMatchesDay(item, activeDay.date))
                    ).length === 0 ? <div style={emptyCellText}>No labour only jobs</div> : null}
                  </div>
                </div>
              ) : (
                <div style={desktopGrid(visibleDays.length)}>
                  <div style={headCell}>Labour / Week</div>

                  {visibleDays.map((day) => (
                    <div
                      key={`labour-head-${day.date}`}
                      style={{
                        ...headCell,
                        ...(day.is_bank_holiday ? holidayHeaderCell : null),
                      }}
                    >
                      <div>{day.label}</div>
                      {day.is_bank_holiday ? (
                        <div style={{ marginTop: 2, fontSize: 11, opacity: 0.8 }}>
                          {day.bank_holiday_label ?? "Bank holiday"}
                        </div>
                      ) : null}
                    </div>
                  ))}

                  <div style={rowHeaderCell}>Labour only</div>

                  {visibleDays.map((day) =>
                    renderDropCell(
                      labourOnlyItems.filter((item) => itemMatchesDay(item, day.date)),
                      { equipmentId: null, dayIso: day.date },
                      Boolean(day.is_bank_holiday)
                    )
                  )}
                </div>
              )}
            </section>
          ) : null}

          <section style={sectionCard}>
            <div style={sectionTitleRow}>
              <div>
                <div style={sectionTitle}>Crane allocations</div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                  Drag jobs between cranes and days. Drop onto a crane/day cell to reassign.
                </div>
              </div>
            </div>

            {isMobile && activeDay ? (
              <div style={{ display: "grid", gap: 12 }}>
                {groupedByEquipment.map(({ equipment, items }) => {
                  const dayItems = sortItemsByStartTime(items.filter((item) => itemMatchesDay(item, activeDay.date)));

                  return (
                    <div key={equipment.id} style={mobileEquipmentBlock}>
                      <div style={mobileRowHeader}>
                        <div style={{ fontWeight: 1000 }}>
                          {equipment.name ?? "Unnamed crane"}
                          {equipment.asset_number ? ` (${equipment.asset_number})` : ""}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.72 }}>{activeDay.label}</div>
                      </div>

                      {(() => {
                        const dayAvailability = availabilityEntriesForDay(equipment, activeDay.date);
                        const blockedByAvailability = availabilityBlocksAssignment(dayAvailability);
                        return (
                          <div
                            style={{
                              ...mobileDayCell,
                              ...(activeDay.is_bank_holiday ? holidayCell : null),
                              ...(dayAvailability.length ? (blockedByAvailability ? assetUnavailableCell : assetSoftUnavailableCell) : null),
                              ...(draggingId && !blockedByAvailability ? dropReadyCell : null),
                            }}
                            title={blockedByAvailability ? "This crane has downtime booked. Remove or unblock the downtime before assigning new work." : undefined}
                            onDragOver={(e) => {
                              if (blockedByAvailability) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(e) => {
                              if (blockedByAvailability) return;
                              e.preventDefault();
                              const item = (data?.items ?? []).find((row) => row.id === draggingId);
                              if (item) {
                                movePlannerItem(item, {
                                  equipmentId: equipment.id,
                                  dayIso: activeDay.date,
                                  plannerGroup: "allocated",
                                });
                              }
                            }}
                          >
                            {renderAssetAvailability(dayAvailability)}
                            {dayItems.length > 0 ? (
                              dayItems.map((item) => renderCard(item, false, activeDay.date))
                            ) : dayAvailability.length ? (
                              <div style={emptyCellText}>No jobs</div>
                            ) : (
                              <div style={emptyCellText}>No jobs</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={desktopGrid(visibleDays.length)}>
                <div style={headCell}>Crane / Week</div>

                {visibleDays.map((day) => (
                  <div
                    key={`head-${day.date}`}
                    style={{
                      ...headCell,
                      ...(day.is_bank_holiday ? holidayHeaderCell : null),
                    }}
                  >
                    <div>{day.label}</div>
                    {day.is_bank_holiday ? (
                      <div style={{ marginTop: 2, fontSize: 11, opacity: 0.8 }}>
                        {day.bank_holiday_label ?? "Bank holiday"}
                      </div>
                    ) : null}
                  </div>
                ))}

                {groupedByEquipment.map(({ equipment, items }) => (
                  <FragmentRow
                    key={equipment.id}
                    header={
                      <div style={rowHeaderCell}>
                        <div style={{ fontWeight: 900 }}>
                          {equipment.name ?? "Unnamed crane"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                          {equipment.asset_number ?? "No reg"}
                        </div>
                      </div>
                    }
                    cells={visibleDays.map((day) =>
                      renderDropCell(
                        items.filter((item) => itemMatchesDay(item, day.date)),
                        { equipmentId: equipment.id, dayIso: day.date, plannerGroup: "allocated" },
                        Boolean(day.is_bank_holiday),
                        false,
                        false,
                        availabilityEntriesForDay(equipment, day.date)
                      )
                    )}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function FragmentRow({
  header,
  cells,
}: {
  header: React.ReactNode;
  cells: React.ReactNode[];
}) {
  return (
    <>
      {header}
      {cells.map((cell, index) => (
        <div key={index}>{cell}</div>
      ))}
    </>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.40)",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const crossHireSectionCard: React.CSSProperties = {
  ...sectionCard,
  background: "linear-gradient(135deg, rgba(255,239,135,0.72), rgba(235,255,198,0.58))",
  border: "4px solid #f5c400",
  boxShadow: "0 10px 32px rgba(181,137,0,0.22)",
};

const sectionTitleRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 20,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
  border: "none",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};

const infoBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const errorBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.18)",
  color: "#8b0000",
  fontWeight: 700,
};

const successBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,160,80,0.14)",
  border: "1px solid rgba(0,160,80,0.18)",
  color: "#0b6b34",
  fontWeight: 700,
};

const dropLane: React.CSSProperties = {
  display: "grid",
  gap: 12,
  minHeight: 80,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.40)",
  border: "1px dashed rgba(0,0,0,0.14)",
};

const dayCell: React.CSSProperties = {
  minHeight: 120,
  padding: 8,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  gap: 8,
  alignContent: "start",
};

const crossHireDayCell: React.CSSProperties = {
  background: "rgba(239,255,215,0.72)",
  border: "1px solid rgba(91,164,66,0.38)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.40)",
};

const mobileDayPickerWrap: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const activeDayPill: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const mobileDayTabs: React.CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 4,
};

const mobileTabBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.60)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const mobileTabActive: React.CSSProperties = {
  ...mobileTabBtn,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};


const assetUnavailableCell: React.CSSProperties = {
  background: "rgba(220,38,38,0.10)",
  border: "2px solid rgba(220,38,38,0.28)",
};

const assetSoftUnavailableCell: React.CSSProperties = {
  background: "rgba(255,170,0,0.08)",
  border: "1px solid rgba(255,170,0,0.22)",
};

const assetAvailabilityWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginBottom: 8,
};

const assetUnavailableBadge: React.CSSProperties = {
  padding: "7px 8px",
  borderRadius: 10,
  background: "rgba(220,38,38,0.14)",
  color: "#7f1d1d",
  border: "1px solid rgba(220,38,38,0.26)",
  fontSize: 12,
  fontWeight: 900,
};

const assetSoftUnavailableBadge: React.CSSProperties = {
  ...assetUnavailableBadge,
  background: "rgba(255,170,0,0.14)",
  color: "#8a5609",
  border: "1px solid rgba(255,170,0,0.26)",
};


const mobileRowHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const crossHireMobileHeader: React.CSSProperties = {
  ...mobileRowHeader,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(249,255,235,0.92)",
  border: "1px solid rgba(91,164,66,0.48)",
  color: "#14532d",
};

const mobileEquipmentBlock: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const mobileDayCell: React.CSSProperties = {
  minHeight: 90,
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  display: "grid",
  gap: 8,
};

const viewToggleWrap: React.CSSProperties = {
  display: "inline-flex",
  gap: 4,
  padding: 4,
  borderRadius: 12,
  background: "rgba(255,255,255,0.70)",
  border: "1px solid rgba(0,0,0,0.10)",
};

const viewToggleBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 9,
  background: "transparent",
  color: "#111",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const viewToggleActive: React.CSSProperties = {
  ...viewToggleBtn,
  background: "#111",
  color: "#fff",
};

function desktopGrid(days: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `220px repeat(${days}, minmax(160px, 1fr))`,
    gap: 8,
    alignItems: "stretch",
  };
}

const headCell: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
  textAlign: "center",
};

const crossHireHeadCell: React.CSSProperties = {
  ...headCell,
  background: "rgba(249,255,235,0.94)",
  border: "1px solid rgba(91,164,66,0.48)",
  color: "#14532d",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.45)",
};

const holidayHeaderCell: React.CSSProperties = {
  background: "rgba(255,170,0,0.16)",
  border: "1px solid rgba(255,170,0,0.24)",
};

const holidayCell: React.CSSProperties = {
  background: "rgba(255,170,0,0.08)",
  border: "1px solid rgba(255,170,0,0.18)",
};

const rowHeaderCell: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  alignSelf: "stretch",
};

const crossHireRowHeaderCell: React.CSSProperties = {
  ...rowHeaderCell,
  background: "rgba(249,255,235,0.92)",
  border: "1px solid rgba(91,164,66,0.48)",
  color: "#14532d",
  fontWeight: 1000,
};

const fullJobCard: React.CSSProperties = {
  position: "relative",
  padding: 12,
  borderRadius: 12,
  display: "grid",
  gap: 2,
  boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
};

const miniJobCard: React.CSSProperties = {
  position: "relative",
  padding: 10,
  borderRadius: 10,
  display: "grid",
  gap: 2,
  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
};

const tagWrap: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 8,
};

const pillWarn: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(255,0,0,0.10)",
  color: "#8b0000",
  fontSize: 11,
  fontWeight: 900,
};

const pillNeutral: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  color: "#111",
  fontSize: 11,
  fontWeight: 800,
};

const pillLabour: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(125,60,152,0.12)",
  color: "#7d3c98",
  fontSize: 11,
  fontWeight: 900,
};

const pillCrossHire: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(214,137,16,0.14)",
  color: "#8a5609",
  fontSize: 11,
  fontWeight: 900,
};

const visitInvoiceRow: React.CSSProperties = {
  marginTop: 8,
  display: "flex",
  gap: 6,
  alignItems: "center",
  flexWrap: "wrap",
};

const visitInvoiceOpenPill: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(255,140,0,0.12)",
  color: "#8a5609",
  border: "1px solid rgba(255,140,0,0.20)",
  fontSize: 11,
  fontWeight: 900,
};

const visitInvoiceDonePill: React.CSSProperties = {
  ...visitInvoiceOpenPill,
  background: "rgba(0,160,80,0.14)",
  color: "#0b6b34",
  border: "1px solid rgba(0,160,80,0.20)",
};

const visitInvoiceBtn: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  fontSize: 11,
  cursor: "pointer",
};

const visitInvoiceUndoBtn: React.CSSProperties = {
  ...visitInvoiceBtn,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
};

const pillLinked: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,120,255,0.12)",
  color: "#0b57d0",
  fontSize: 11,
  fontWeight: 900,
};

const emptyCellText: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.72,
};

const menuWrap: React.CSSProperties = {
  position: "relative",
  flexShrink: 0,
};

const menuBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.84)",
  fontWeight: 1000,
  cursor: "pointer",
};

const menuList: React.CSSProperties = {
  position: "absolute",
  top: 34,
  right: 0,
  minWidth: 180,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "#fff",
  boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
  overflow: "hidden",
  zIndex: 2000,
};

const menuItemLink: React.CSSProperties = {
  display: "block",
  padding: "10px 12px",
  textDecoration: "none",
  color: "#111",
  fontSize: 14,
  fontWeight: 700,
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

const menuItemBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  border: "none",
  background: "#fff",
  color: "#111",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

const dropReadyCell: React.CSSProperties = {
  outline: "2px dashed rgba(0,120,255,0.35)",
  outlineOffset: 2,
};
