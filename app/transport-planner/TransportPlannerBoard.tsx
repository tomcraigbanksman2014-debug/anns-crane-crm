"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type VisitInvoiceEntry = {
  id?: string;
  invoice_status?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  charge?: number | null;
  notes?: string | null;
};

type PlannerItem = {
  job_id: string;
  transport_number?: string | null;
  client_name?: string | null;
  linked_job_id?: string | null;
  collection_address?: string | null;
  delivery_address?: string | null;
  transport_date?: string | null;
  collection_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  operator_name?: string | null;
  operator_id?: string | null;
  vehicle_id?: string | null;
  status?: string | null;
  invoice_status?: string | null;
  job_type?: string | null;
  load_description?: string | null;
  supplier_id?: string | null;
  supplier_reference?: string | null;
  supplier_cost?: number | null;
  planner_group?: string | null;
  agreed_sell_rate?: number | null;
  job_price?: number | null;
  price_mode?: string | null;
  price_per_day?: number | null;
  abnormal_load_enabled?: boolean | null;
  abnormal_load_category?: string | null;
  movement_reference?: string | null;
  movement_order_reference?: string | null;
  movement_order_status?: string | null;
  submission_method?: string | null;
  submission_status?: string | null;
  approval_status?: string | null;
  approval_reference?: string | null;
  authorised_to_move?: boolean | null;
  visit_invoices?: Record<string, VisitInvoiceEntry>;
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

type VehicleRow = {
  id: string;
  name: string;
  reg_number?: string | null;
  status?: string | null;
  availability?: AssetAvailabilityEntry[];
  items: PlannerItem[];
};

type PlannerDay = {
  key: string;
  label: string;
  holiday?: string | null;
};

type PlannerResponse = {
  week_start: string;
  week_end: string;
  bank_holidays: Array<{ date: string; label: string }>;
  vehicles: VehicleRow[];
  unallocated_jobs: PlannerItem[];
  cross_hired_jobs: PlannerItem[];
};

type DropTarget = {
  vehicleId: string | null;
  dayIso: string;
  plannerGroup?: string | null;
};

type PlannerViewMode = "rolling_7_days" | "current_week";

const DEFAULT_PLANNER_VIEW_MODE: PlannerViewMode = "rolling_7_days";
const PLANNER_VIEW_LABELS: Record<PlannerViewMode, string> = {
  rolling_7_days: "Rolling 7 days",
  current_week: "Current week",
};

function parseDateOnly(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shiftDateByDays(dayIso: string, deltaDays: number) {
  const base = parseDateOnly(dayIso);
  if (!base) return dayIso;
  return isoDateLocal(addDays(base, deltaDays));
}

function deliveryDateForMove(item: PlannerItem, newStartIso: string) {
  const start = parseDateOnly(item.transport_date ?? null);
  const end = parseDateOnly(item.delivery_date ?? item.transport_date ?? null);
  if (!start || !end) return newStartIso;
  const spanDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  return shiftDateByDays(newStartIso, spanDays);
}

function isNoOpenTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-no-open='true']"));
}

function canDragTransportItem(item: PlannerItem) {
  return String(item.status ?? "").trim().toLowerCase() !== "completed";
}

function fmtMoney(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function statusTone(status: string | null | undefined): React.CSSProperties {
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

  return {
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

function sortItemsByStartTime(items: PlannerItem[]) {
  return [...items].sort((a, b) => {
    const at = String(a.collection_time ?? "99:99");
    const bt = String(b.collection_time ?? "99:99");
    if (at !== bt) return at.localeCompare(bt);
    return String(a.transport_number ?? a.job_id ?? "").localeCompare(String(b.transport_number ?? b.job_id ?? ""));
  });
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

function itemMatchesDay(item: PlannerItem, dayIso: string) {
  const start = String(item.transport_date ?? "").trim();
  const end = String(item.delivery_date ?? item.transport_date ?? "").trim();
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

function availabilityEntriesForDay(vehicle: VehicleRow, dayIso: string) {
  return (vehicle.availability ?? []).filter((entry) => availabilityMatchesDay(entry, dayIso));
}

function availabilityBlocksAssignment(entries: AssetAvailabilityEntry[]) {
  return entries.some((entry) => entry.blocks_assignment !== false);
}

function getDisplayPrice(item: PlannerItem) {
  const agreed = Number(item.agreed_sell_rate ?? 0);
  if (agreed > 0) return agreed;
  return Number(item.job_price ?? 0);
}

function isCrossHiredTransportItem(item: PlannerItem) {
  return String(item.planner_group ?? "") === "cross_hired";
}

function isLinkedCraneTransportItem(item: PlannerItem) {
  return Boolean(String(item.linked_job_id ?? "").trim());
}

function isAbnormalTransportItem(item: PlannerItem) {
  return Boolean(item.abnormal_load_enabled);
}

function abnormalCategoryLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "heavy_haulage") return "Heavy haulage";
  if (raw === "escorted_movement") return "Escorted movement";
  if (raw === "modular_movement") return "Modular movement";
  return "Abnormal load";
}

function movementOrderStatusShortLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "ready_to_submit") return "Ready to submit";
  if (raw === "awaiting_response") return "Awaiting response";
  if (raw === "awaiting_approval") return "Awaiting approval";
  if (raw === "amendments_required") return "Amendments needed";
  return raw ? raw.replace(/_/g, " ") : "Not started";
}

function getTransportCardHighlightStyle(item: PlannerItem, compact = false): React.CSSProperties {
  const baseShadow = compact ? "0 4px 12px rgba(0,0,0,0.05)" : "0 4px 12px rgba(0,0,0,0.05)";

  if (isCrossHiredTransportItem(item)) {
    return {
      background: "rgba(246, 198, 117, 0.26)",
      border: "1px solid rgba(214,137,16,0.34)",
      outline: "2px solid rgba(214,137,16,0.24)",
      outlineOffset: -2,
      boxShadow: `inset 4px 0 0 #d68910, ${baseShadow}`,
    };
  }

  if (isLinkedCraneTransportItem(item)) {
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

export default function TransportPlannerBoard() {
  const [plannerViewMode, setPlannerViewMode] = useState<PlannerViewMode>(DEFAULT_PLANNER_VIEW_MODE);
  const [preferenceLoading, setPreferenceLoading] = useState(true);
  const [preferenceError, setPreferenceError] = useState("");
  const [weekStart, setWeekStart] = useState<string>(() => plannerStartForMode(DEFAULT_PLANNER_VIEW_MODE));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlannerResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDayIndex, setMobileDayIndex] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [invoicingVisitKey, setInvoicingVisitKey] = useState<string | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const dragAutoScrollFrameRef = useRef<number | null>(null);

  async function loadBoard(targetWeekStart: string) {
    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch(`/api/transport-planner/board?date=${encodeURIComponent(targetWeekStart)}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Could not load transport planner.");
      }

      setData(json);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load transport planner.");
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
        setPlannerViewMode(nextMode);
        setWeekStart(plannerStartForMode(nextMode));
      } catch (e: any) {
        setPreferenceError(e?.message || "Could not load planner view preference.");
        setPlannerViewMode(DEFAULT_PLANNER_VIEW_MODE);
        setWeekStart(plannerStartForMode(DEFAULT_PLANNER_VIEW_MODE));
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
    function onDocPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-transport-menu-root="true"]')) {
        return;
      }
      setOpenMenuId(null);
    }

    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
  }, []);

  const visibleDays = useMemo(() => {
    const base = new Date(`${weekStart}T00:00:00`);
    const holidayMap: Record<string, string> = {};

    for (const item of data?.bank_holidays ?? []) {
      holidayMap[item.date] = item.label;
    }

    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      const key = isoDateLocal(d);

      return {
        key,
        label: d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
        holiday: holidayMap[key] ?? null,
      };
    });
  }, [data, weekStart]);

  useEffect(() => {
    if (!visibleDays.length) {
      setMobileDayIndex(0);
      return;
    }

    const today = isoDateLocal(new Date());
    const idx = visibleDays.findIndex((day) => day.key === today);
    setMobileDayIndex((current) => {
      if (current >= 0 && current < visibleDays.length) return current;
      return idx >= 0 ? idx : 0;
    });
  }, [weekStart, visibleDays.length]);

  const activeDay = visibleDays[Math.min(mobileDayIndex, Math.max(visibleDays.length - 1, 0))] ?? null;

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
      setMessage(`Planner view saved: ${PLANNER_VIEW_LABELS[safeMode]}.`);
    } catch (e: any) {
      setPreferenceError(e?.message || "Could not save planner view preference.");
    }
  }

  function getVisitInvoiceEntry(item: PlannerItem, visibleDayIso?: string | null) {
    if (!visibleDayIso) return null;
    const explicitEntry = item.visit_invoices?.[visibleDayIso] ?? null;
    if (explicitEntry) return explicitEntry;

    const parentStatus = String(item.invoice_status ?? "").trim();
    if (parentStatus && parentStatus.toLowerCase() !== "not invoiced") {
      return {
        invoice_status: parentStatus,
        notes: "Shown from the main transport job invoice status.",
      };
    }

    return null;
  }

  function visitIsInvoiced(entry: VisitInvoiceEntry | null) {
    const status = String(entry?.invoice_status ?? "").trim().toLowerCase();
    return status === "invoiced" || status === "part paid" || status === "paid";
  }

  async function setVisitInvoiceStatus(item: PlannerItem, visibleDayIso: string, nextStatus: "Not Invoiced" | "Invoiced") {
    const visitInvoiceKey = `${item.job_id}:${visibleDayIso}`;
    setInvoicingVisitKey(visitInvoiceKey);
    setActionError("");
    setMessage("");

    try {
      const res = await fetch("/api/transport-planner/visit-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transport_job_id: item.job_id,
          visit_date: visibleDayIso,
          invoice_status: nextStatus,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not update transport visit invoice status.");

      setMessage(nextStatus === "Invoiced" ? "Transport visit marked as invoiced." : "Transport visit marked as not invoiced.");
      await loadBoard(weekStart);
    } catch (e: any) {
      setActionError(e?.message || "Could not update transport visit invoice status.");
    } finally {
      setInvoicingVisitKey(null);
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

  async function movePlannerItem(item: PlannerItem, target: DropTarget) {
    if (movingId) return;

    const nextTransportDate = target.dayIso;
    const nextDeliveryDate = deliveryDateForMove(item, nextTransportDate);
    const nextVehicleId = target.vehicleId;

    const currentPlannerGroup = String(item.planner_group ?? "").trim();
    const nextPlannerGroup = String(target.plannerGroup ?? currentPlannerGroup).trim();
    const movingToCrossHire = nextPlannerGroup === "cross_hired";
    const hasSubcontractMeta = Boolean(
      String(item.supplier_id ?? "").trim() ||
      String(item.supplier_reference ?? "").trim() ||
      Number(item.supplier_cost ?? 0) > 0
    );

    const alreadySame =
      String(item.vehicle_id ?? "") === String(nextVehicleId ?? "") &&
      String(item.transport_date ?? "") === nextTransportDate &&
      String(item.delivery_date ?? item.transport_date ?? "") === nextDeliveryDate &&
      currentPlannerGroup === nextPlannerGroup;

    if (alreadySame) return;

    if (movingToCrossHire && !hasSubcontractMeta) {
      window.location.href = `/transport-jobs/${item.job_id}#supplier_id`;
      return;
    }

    setMovingId(item.job_id);
    setActionId(item.job_id);
    setOpenMenuId(null);
    setActionError("");
    setMessage("");

    try {
      const res = await fetch("/api/transport-planner/board/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transport_job_id: item.job_id,
          vehicle_id: nextVehicleId ?? "",
          transport_date: nextTransportDate,
          delivery_date: nextDeliveryDate,
          collection_time: item.collection_time ?? "",
          delivery_time: item.delivery_time ?? "",
          status: item.status ?? "planned",
          target_planner_group: target.plannerGroup ?? null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Could not move transport job.");
      }

      setMessage("Transport planner updated.");
      await loadBoard(weekStart);
    } catch (e: any) {
      setActionError(e?.message || "Could not move transport job.");
    } finally {
      setMovingId(null);
      setActionId(null);
      setDraggingId(null);
    }
  }

  function onDragStart(e: React.DragEvent<HTMLDivElement>, item: PlannerItem) {
    if (isNoOpenTarget(e.target)) {
      e.preventDefault();
      return;
    }
    try {
      e.dataTransfer.effectAllowed = "move";
      dragPointerYRef.current = e.clientY;
      e.dataTransfer.setData("text/plain", item.job_id);
      e.dataTransfer.setData("application/x-transport-job-id", item.job_id);
    } catch {}
    setDraggingId(item.job_id);
    setOpenMenuId(null);
  }

  function onDragEnd() {
    dragPointerYRef.current = null;
    setDraggingId(null);
  }

  async function duplicateTransportJob(item: PlannerItem) {
    setActionId(item.job_id);
    setOpenMenuId(null);
    setActionError("");
    setMessage("");

    try {
      const res = await fetch("/api/transport-jobs/duplicate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ job_id: item.job_id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Could not duplicate transport job.");
      }

      const newId = String(json?.job?.id ?? "").trim();
      if (newId) {
        window.location.href = `/transport-jobs/${newId}`;
        return;
      }

      setMessage("Transport job duplicated.");
      await loadBoard(weekStart);
    } catch (e: any) {
      setActionError(e?.message || "Could not duplicate transport job.");
    } finally {
      setActionId(null);
    }
  }

  async function clearVehicleAssignment(item: PlannerItem) {
    setActionId(item.job_id);
    setOpenMenuId(null);
    setActionError("");
    setMessage("");

    try {
      const res = await fetch("/api/transport-planner/board/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transport_job_id: item.job_id,
          vehicle_id: "",
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Could not remove vehicle assignment.");
      }

      setMessage("Vehicle assignment removed.");
      await loadBoard(weekStart);
    } catch (e: any) {
      setActionError(e?.message || "Could not remove vehicle assignment.");
    } finally {
      setActionId(null);
    }
  }

  function openJob(id: string) {
    window.location.href = `/transport-jobs/${id}`;
  }

  function openEdit(id: string) {
    window.location.href = `/transport-jobs/${id}`;
  }

  function renderMenu(item: PlannerItem) {
    const isOpen = openMenuId === item.job_id;

    function noBubble(e: React.MouseEvent | React.PointerEvent) {
      e.stopPropagation();
    }

    return (
      <div data-no-open="true" data-transport-menu-root="true" style={menuWrap} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          style={menuBtn}
          onMouseDown={noBubble}
          onPointerDown={noBubble}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpenMenuId((current) => (current === item.job_id ? null : item.job_id));
          }}
        >
          ⋯
        </button>

        {isOpen ? (
          <div style={menuList} onMouseDown={noBubble} onPointerDown={noBubble}>
            <button type="button" style={menuItemBtn} onClick={(e) => { noBubble(e); openJob(item.job_id); }}>
              Open transport job
            </button>
            <button type="button" style={menuItemBtn} onClick={(e) => { noBubble(e); openEdit(item.job_id); }}>
              Edit transport job
            </button>
            <button type="button" style={menuItemBtn} onClick={(e) => { noBubble(e); duplicateTransportJob(item); }}>
              Duplicate transport job
            </button>
            {item.vehicle_id ? (
              <button type="button" style={menuItemBtn} onClick={(e) => { noBubble(e); clearVehicleAssignment(item); }}>
                Remove vehicle assignment
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderJobCard(item: PlannerItem, compact = false, visibleDayIso?: string | null) {
    const busy = actionId === item.job_id || movingId === item.job_id;
    const crossHireItem = isCrossHiredTransportItem(item);
    const linkedCraneItem = isLinkedCraneTransportItem(item);
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
        key={`${item.job_id}-${item.transport_date}-${item.delivery_date}-${compact ? "compact" : "full"}`}
        draggable={canDragTransportItem(item) && !busy && openMenuId !== item.job_id}
        onDragStart={(e) => onDragStart(e, item)}
        onDragEnd={onDragEnd}
        style={{
          ...(compact ? miniJobCard : jobCardStyle),
          ...statusTone(item.status),
          ...getTransportCardHighlightStyle(item, compact),
          opacity: draggingId === item.job_id ? 0.55 : busy ? 0.65 : 1,
          cursor:
            busy
              ? "wait"
              : !canDragTransportItem(item) || openMenuId === item.job_id
              ? "default"
              : "grab",
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest("[data-no-open='true']")) {
            return;
          }
          openJob(item.job_id);
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 1000 }}>{item.transport_number ?? "Transport job"}</div>
            <div style={{ marginTop: 4, fontSize: compact ? 12 : 13, opacity: 0.82 }}>
              {item.client_name ?? "No customer"}
            </div>
          </div>
          {renderMenu(item)}
        </div>

        <div style={{ marginTop: 4, fontSize: compact ? 11 : 12, opacity: 0.82 }}>
          {item.job_type ?? "—"}
        </div>
        <div style={{ marginTop: 4, fontSize: compact ? 11 : 12, opacity: 0.78 }}>
          {item.collection_address ?? "No collection"} → {item.delivery_address ?? "No delivery"}
        </div>
        <div style={{ marginTop: 6, fontSize: compact ? 11 : 12, opacity: 0.72 }}>
          {item.collection_time ?? "—"} → {item.delivery_time ?? "—"}
        </div>
        {crossHireItem ? (
          <>
            <div style={{ marginTop: 6, fontSize: compact ? 11 : 12, fontWeight: 900 }}>
              PO cost {fmtMoney(item.supplier_cost ?? 0)}
            </div>
            <div style={{ marginTop: 2, fontSize: compact ? 11 : 12, fontWeight: 900 }}>
              Charge {fmtMoney(displayPrice)}
              {String(item.price_mode ?? "full_job") === "per_day" ? ` • Per day ${fmtMoney(item.price_per_day ?? 0)}` : " • Full job"}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 6, fontSize: compact ? 11 : 12, fontWeight: 900 }}>
            {fmtMoney(displayPrice)}
            {String(item.price_mode ?? "full_job") === "per_day" ? ` • Per day ${fmtMoney(item.price_per_day ?? 0)}` : " • Full job"}
          </div>
        )}
        {visibleDayIso ? (
          <div data-no-open="true" style={visitInvoiceRow}>
            <span style={visitInvoiced ? visitInvoiceDonePill : visitInvoiceOpenPill}>
              {visitInvoiced ? "Visit invoiced" : "Visit not invoiced"}
              {visitInvoiceEntry?.invoice_number ? ` • ${visitInvoiceEntry.invoice_number}` : ""}
            </span>
            <button
              type="button"
              data-no-open="true"
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
          <div style={pillNeutral}>{item.operator_name ?? "Unassigned"}</div>
          {crossHireItem ? <div style={pillCrossHire}>Cross hire / subcontract</div> : null}
          {linkedCraneItem ? <div style={pillLinked}>Linked crane job</div> : null}
          {isAbnormalTransportItem(item) ? <div style={pillAbnormal}>{abnormalCategoryLabel(item.abnormal_load_category)}</div> : null}
          {isAbnormalTransportItem(item) && item.submission_status ? <div style={pillSubmission}>{movementOrderStatusShortLabel(item.movement_order_status ?? item.submission_status)}</div> : null}
          {isAbnormalTransportItem(item) ? (
            <div style={item.authorised_to_move ? pillAuthorised : pillNotAuthorised}>
              {item.authorised_to_move ? "Authorised" : "Not authorised"}
            </div>
          ) : null}
          {item.movement_order_reference ? <div style={pillNeutral}>{item.movement_order_reference}</div> : null}
          {item.movement_reference ? <div style={pillNeutral}>{item.movement_reference}</div> : null}
          {item.approval_reference ? <div style={pillNeutral}>{item.approval_reference}</div> : null}
          {item.supplier_reference ? <div style={pillNeutral}>{item.supplier_reference}</div> : null}
          {!item.vehicle_id && item.planner_group !== "cross_hired" ? <div style={pillWarn}>No vehicle assigned</div> : null}
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
          ...(crossHireSection ? crossHireDayCell : {}),
          ...(highlight
            ? {
                background: "rgba(255,170,0,0.08)",
                border: "1px solid rgba(255,170,0,0.18)",
              }
            : {}),
          ...(availabilityEntries.length ? (blockedByAvailability ? assetUnavailableCell : assetSoftUnavailableCell) : {}),
          ...(draggingId && !blockedByAvailability ? dropReadyCell : {}),
        }}
        title={blockedByAvailability ? "This vehicle has downtime booked. Remove or unblock the downtime before assigning new work." : undefined}
        onDragOver={(e) => {
          if (blockedByAvailability) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          if (blockedByAvailability) return;
          e.preventDefault();
          const droppedId = (e.dataTransfer.getData("application/x-transport-job-id") || e.dataTransfer.getData("text/plain") || draggingId || "").trim();
          const item = [...(data?.unallocated_jobs ?? []), ...(data?.cross_hired_jobs ?? []), ...(data?.vehicles ?? []).flatMap((vehicle) => vehicle.items)].find(
            (row) => row.job_id === droppedId
          );
          if (item) {
            movePlannerItem(item, target);
          }
        }}
      >
        {renderAssetAvailability(availabilityEntries)}
        {items.length === 0 ? (
          showEmptyCrossHire ? <div style={emptyState}>No cross-hired transport jobs</div> : availabilityEntries.length ? <div style={emptyState}>No jobs</div> : <div style={emptyState}>Free</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>{items.map((item) => renderJobCard(item, true, target.dayIso))}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={toolbarStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: 28 }}>Transport Planner</h2>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Showing from {data?.week_start ?? weekStart} to {data?.week_end ?? visibleDays[visibleDays.length - 1]?.key ?? weekStart}
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
          <a href="/transport-jobs/new" style={primaryBtn}>+ Add transport job</a>
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
                {activeDay.holiday ? activeDay.holiday : activeDay.key}
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
                key={day.key}
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
      {loading || preferenceLoading ? <div style={infoBox}>Loading transport planner…</div> : null}
      {loadError ? <div style={errorBox}>{loadError}</div> : null}
      {actionError ? <div style={errorBox}>{actionError}</div> : null}
      {message ? <div style={successBox}>{message}</div> : null}

      {!loading && !loadError ? (
        <>

          <section style={crossHireSectionCard}>
            <div style={sectionTitleRow}>
              <div>
                <div style={sectionTitle}>Cross-hired transport</div>
                <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                  Supplier-fulfilled transport kept separate from the owned vehicle rows.
                </div>
              </div>
            </div>

            {isMobile && activeDay ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={crossHireMobileHeader}>
                  <div style={{ fontWeight: 1000 }}>Cross-hired transport</div>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>{activeDay.label}</div>
                </div>
                {renderDropCell(
                  sortItemsByStartTime(
                    (data?.cross_hired_jobs ?? []).filter((item) => itemMatchesDay(item, activeDay.key))
                  ),
                  { vehicleId: null, dayIso: activeDay.key, plannerGroup: "cross_hired" },
                  Boolean(activeDay.holiday),
                  true,
                  true
                )}
              </div>
            ) : (
              <div style={desktopGrid(visibleDays.length)}>
                <div style={crossHireHeadCell}>Cross-hire / Week</div>

                {visibleDays.map((day) => (
                  <div
                    key={`cross-transport-head-${day.key}`}
                    style={{
                      ...crossHireHeadCell,
                      ...(day.holiday
                        ? {
                            background: "rgba(255,170,0,0.16)",
                            border: "1px solid rgba(255,170,0,0.24)",
                          }
                        : {}),
                    }}
                  >
                    <div>{day.label}</div>
                    <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>
                      {day.holiday ? day.holiday : "Working day"}
                    </div>
                  </div>
                ))}

                <div style={crossHireSideCell}>
                  <div style={{ fontWeight: 1000 }}>Cross hired</div>
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>Supplier vehicles</div>
                </div>

                {visibleDays.map((day) => {
                  const dayItems = sortItemsByStartTime(
                    (data?.cross_hired_jobs ?? []).filter((item) => itemMatchesDay(item, day.key))
                  );

                  return renderDropCell(
                    dayItems,
                    { vehicleId: null, dayIso: day.key, plannerGroup: "cross_hired" },
                    Boolean(day.holiday),
                    true,
                    true
                  );
                })}
              </div>
            )}
          </section>

          {(data?.unallocated_jobs ?? []).length > 0 ? (
            <section style={sectionCard}>
              <div style={sectionTitle}>Unassigned transport jobs</div>
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  minHeight: 88,
                  padding: 8,
                  borderRadius: 12,
                  border: "1px dashed rgba(0,0,0,0.10)",
                  background: draggingId ? "rgba(255,255,255,0.35)" : "transparent",
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const item = [...(data?.unallocated_jobs ?? []), ...(data?.cross_hired_jobs ?? []), ...(data?.vehicles ?? []).flatMap((vehicle) => vehicle.items)].find(
                    (row) => row.job_id === draggingId
                  );
                  if (item) {
                    movePlannerItem(item, {
                      vehicleId: null,
                      dayIso: String(item.transport_date ?? activeDay?.key ?? visibleDays[0]?.key ?? weekStart),
                    });
                  }
                }}
              >
                {sortItemsByStartTime(data?.unallocated_jobs ?? []).map((item) => renderJobCard(item))}
              </div>
            </section>
          ) : null}

          <div style={{ display: "grid", gap: 16 }}>
            {(data?.vehicles ?? []).map((vehicle) => (
              <section key={vehicle.id} style={sectionCard}>
                <div style={sectionTitleRow}>
                  <div>
                    <div style={sectionTitle}>{vehicle.name ?? "Vehicle"}</div>
                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                      {vehicle.reg_number ? vehicle.reg_number : "No reg"}
                      {vehicle.status ? ` • ${vehicle.status}` : ""}
                    </div>
                  </div>
                </div>

                {isMobile && activeDay ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={mobileRowHeader}>
                      <div style={{ fontWeight: 1000 }}>{vehicle.name ?? "Vehicle"}</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>{vehicle.reg_number ?? activeDay.label}</div>
                    </div>
                    <MobileDayCell
                      day={activeDay}
                      items={sortItemsByStartTime(vehicle.items.filter((item) => itemMatchesDay(item, activeDay.key)))}
                      availabilityEntries={availabilityEntriesForDay(vehicle, activeDay.key)}
                      renderItem={(item) => renderJobCard(item, true, activeDay.key)}
                    />
                  </div>
                ) : (
                  <div style={desktopGrid(visibleDays.length)}>
                    <div style={headCell}>Vehicle / Week</div>

                    {visibleDays.map((day) => (
                      <div
                        key={day.key}
                        style={{
                          ...headCell,
                          ...(day.holiday
                            ? {
                                background: "rgba(255,170,0,0.16)",
                                border: "1px solid rgba(255,170,0,0.24)",
                              }
                            : {}),
                        }}
                      >
                        <div>{day.label}</div>
                        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.72 }}>
                          {day.holiday ? day.holiday : "Working day"}
                        </div>
                      </div>
                    ))}

                    <div style={sideCell}>
                      <div style={{ fontWeight: 1000 }}>{vehicle.name ?? "Vehicle"}</div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{vehicle.reg_number ?? ""}</div>
                    </div>

                    {visibleDays.map((day) => {
                      const dayItems = sortItemsByStartTime(vehicle.items.filter((item) => itemMatchesDay(item, day.key)));

                      return renderDropCell(
                        dayItems,
                        { vehicleId: vehicle.id, dayIso: day.key, plannerGroup: "allocated" },
                        Boolean(day.holiday),
                        false,
                        false,
                        availabilityEntriesForDay(vehicle, day.key)
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MobileDayCell({
  day,
  items,
  availabilityEntries = [],
  renderItem,
}: {
  day: PlannerDay;
  items: PlannerItem[];
  availabilityEntries?: AssetAvailabilityEntry[];
  renderItem: (item: PlannerItem) => React.ReactNode;
}) {
  const blockedByAvailability = availabilityBlocksAssignment(availabilityEntries);

  return (
    <div
      style={{
        ...mobileDayCell,
        ...(day.holiday
          ? {
              background: "rgba(255,170,0,0.08)",
              border: "1px solid rgba(255,170,0,0.18)",
            }
          : {}),
        ...(availabilityEntries.length ? (blockedByAvailability ? assetUnavailableCell : assetSoftUnavailableCell) : {}),
      }}
    >
      {availabilityEntries.length ? (
        <div style={assetAvailabilityWrap}>
          {availabilityEntries.map((entry) => {
            const timeText = availabilityTimeLabel(entry);
            return (
              <div key={entry.id} style={entry.blocks_assignment !== false ? assetUnavailableBadge : assetSoftUnavailableBadge}>
                <div style={{ fontWeight: 1000 }}>{assetAvailabilityStatusLabel(entry.status)}</div>
                <div style={{ marginTop: 2, fontSize: 11 }}>
                  {entry.blocks_assignment !== false ? "Blocked" : "Note only"}
                  {timeText ? ` • ${timeText}` : ""}
                </div>
                {entry.notes ? <div style={{ marginTop: 2, fontSize: 11, opacity: 0.78 }}>{entry.notes}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {items.length === 0 ? <div style={emptyState}>{availabilityEntries.length ? "No jobs" : "Free"}</div> : <div style={{ display: "grid", gap: 8 }}>{items.map(renderItem)}</div>}
    </div>
  );
}

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

function desktopGrid(dayCount: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `220px repeat(${dayCount}, minmax(160px, 1fr))`,
    gap: 10,
    alignItems: "stretch",
  };
}

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const mobileDayPickerWrap: React.CSSProperties = {
  display: "grid",
  gap: 10,
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

const activeDayPill: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
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
  fontSize: 20,
  fontWeight: 1000,
};

const headCell: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 900,
  fontSize: 13,
};

const crossHireHeadCell: React.CSSProperties = {
  ...headCell,
  background: "rgba(249,255,235,0.94)",
  border: "1px solid rgba(91,164,66,0.48)",
  color: "#14532d",
  textAlign: "center",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.45)",
};

const sideCell: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const crossHireSideCell: React.CSSProperties = {
  ...sideCell,
  background: "rgba(249,255,235,0.92)",
  border: "1px solid rgba(91,164,66,0.48)",
  color: "#14532d",
};

const dayCell: React.CSSProperties = {
  minHeight: 120,
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const crossHireDayCell: React.CSSProperties = {
  background: "rgba(239,255,215,0.72)",
  border: "1px solid rgba(91,164,66,0.38)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.40)",
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
  gap: 12,
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

const mobileDayCell: React.CSSProperties = {
  minHeight: 100,
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const jobCardStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  textDecoration: "none",
  color: "#111",
  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
};

const miniJobCard: React.CSSProperties = {
  ...jobCardStyle,
  padding: 10,
};

const tagWrap: React.CSSProperties = {
  marginTop: 8,
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const pillNeutral: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  background: "rgba(255,255,255,0.7)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const pillWarn: React.CSSProperties = {
  ...pillNeutral,
  background: "rgba(255,180,0,0.16)",
  border: "1px solid rgba(255,180,0,0.22)",
};

const pillCrossHire: React.CSSProperties = {
  ...pillNeutral,
  background: "rgba(214,137,16,0.14)",
  border: "1px solid rgba(214,137,16,0.24)",
  color: "#8a5609",
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
  ...pillNeutral,
  background: "rgba(0,120,255,0.12)",
  border: "1px solid rgba(0,120,255,0.22)",
  color: "#0b57d0",
};

const pillAbnormal: React.CSSProperties = {
  ...pillNeutral,
  background: "rgba(127,90,240,0.14)",
  border: "1px solid rgba(127,90,240,0.24)",
  color: "#5a33b0",
};

const pillSubmission: React.CSSProperties = {
  ...pillNeutral,
  background: "rgba(34,197,94,0.12)",
  border: "1px solid rgba(34,197,94,0.22)",
  color: "#166534",
};

const pillAuthorised: React.CSSProperties = {
  ...pillNeutral,
  background: "rgba(16,185,129,0.14)",
  border: "1px solid rgba(16,185,129,0.24)",
  color: "#065f46",
};

const pillNotAuthorised: React.CSSProperties = {
  ...pillNeutral,
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.24)",
  color: "#991b1b",
};

const dropReadyCell: React.CSSProperties = {
  outline: "2px dashed rgba(0,120,255,0.28)",
  outlineOffset: -3,
};

const infoBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const errorBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.20)",
};

const successBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.20)",
};

const emptyState: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.7,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid #111",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};

const menuWrap: React.CSSProperties = {
  position: "relative",
  flexShrink: 0,
};

const menuBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.90)",
  fontWeight: 1000,
  cursor: "pointer",
};

const menuList: React.CSSProperties = {
  position: "absolute",
  top: 38,
  right: 0,
  minWidth: 210,
  display: "grid",
  gap: 4,
  padding: 6,
  borderRadius: 12,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
  zIndex: 20,
};

const menuItemBtn: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid transparent",
  background: "rgba(255,255,255,0.92)",
  cursor: "pointer",
  fontWeight: 800,
};
