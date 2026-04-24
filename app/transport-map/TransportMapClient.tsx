"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import L, { type LatLngBoundsExpression, type LatLngExpression } from "leaflet";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

const SafeMapContainer = MapContainer as any;
const SafeTileLayer = TileLayer as any;
const SafeMarker = Marker as any;
const SafePopup = Popup as any;
const SafePolyline = Polyline as any;

type TransportItem = {
  id: string;
  transport_number: string | null;
  transport_date: string | null;
  collection_time: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  collection_address: string | null;
  delivery_address: string | null;
  collection_lat: number | null;
  collection_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  collection_route_order: number | null;
  delivery_route_order: number | null;
  status: string | null;
  job_type: string | null;
  load_description: string | null;
  price: number | null;
  agreed_sell_rate: number | null;
  vehicle_id: string | null;
  operator_id: string | null;
  linked_job_id: string | null;
  archived?: boolean | null;
  vehicles:
    | { name: string | null; reg_number: string | null; status?: string | null }
    | { name: string | null; reg_number: string | null; status?: string | null }[]
    | null;
  operators:
    | { full_name: string | null }
    | { full_name: string | null }[]
    | null;
  jobs:
    | {
        id: string;
        job_number: string | number | null;
        site_name: string | null;
        job_date?: string | null;
      }
    | {
        id: string;
        job_number: string | number | null;
        site_name: string | null;
        job_date?: string | null;
      }[]
    | null;
  clients:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null;
};

type DriverLocation = {
  id: string;
  transport_job_id: string | null;
  operator_id: string | null;
  vehicle_id: string | null;
  lat: number | null;
  lng: number | null;
  recorded_at: string | null;
};

type RouteStop = {
  key: string;
  transportJobId: string;
  stopType: "pickup" | "delivery";
  stopOrder: number;
  routeDate: string;
  plannedTime: string | null;
  customerName: string;
  transportNumber: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
  vehicleId: string | null;
  vehicleLabel: string;
  driverName: string;
  linkedJobLabel: string;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function prettyStatus(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "in_progress") return "In Progress";
  if (v === "planned") return "Planned";
  if (v === "confirmed") return "Confirmed";
  if (v === "completed") return "Completed";
  if (v === "cancelled") return "Cancelled";
  return value || "—";
}

function prettyJobType(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();
  if (v === "crane_support") return "Crane Support";
  if (v === "haulage") return "Haulage";
  if (v === "delivery") return "Delivery";
  if (v === "collection") return "Collection";
  if (v === "ballast") return "Ballast";
  return value || "—";
}

function prettyStopType(value: "pickup" | "delivery") {
  return value === "pickup" ? "Pickup" : "Delivery";
}

const UK_BOUNDS = {
  minLat: 49.5,
  maxLat: 61.5,
  minLng: -8.8,
  maxLng: 2.5,
};

function isLikelyUkPoint(lat: number | null, lng: number | null) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= UK_BOUNDS.minLat &&
    lat <= UK_BOUNDS.maxLat &&
    lng >= UK_BOUNDS.minLng &&
    lng <= UK_BOUNDS.maxLng
  );
}

function hasCoords(lat: number | null, lng: number | null) {
  return isLikelyUkPoint(lat, lng);
}

function asLatLng(lat: number, lng: number): LatLngExpression {
  return [lat, lng];
}

function createColoredIcon(color: string, label: string) {
  return new L.DivIcon({
    className: "",
    html: `
      <div style="
        min-width:20px;
        height:20px;
        padding:0 4px;
        border-radius:999px;
        background:${color};
        border:2px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,0.30);
        color:#fff;
        font-size:10px;
        font-weight:900;
        line-height:16px;
        display:flex;
        align-items:center;
        justify-content:center;
      ">${label}</div>
    `,
    iconSize: [24, 20],
    iconAnchor: [12, 10],
    popupAnchor: [0, -10],
  });
}

function createRouteStopIcon(order: number, stopType: "pickup" | "delivery") {
  const bg = stopType === "pickup" ? "#2563eb" : "#16a34a";

  return new L.DivIcon({
    className: "",
    html: `
      <div style="
        width:28px;
        height:28px;
        border-radius:999px;
        background:${bg};
        border:3px solid #fff;
        box-shadow:0 3px 10px rgba(0,0,0,0.28);
        color:#fff;
        font-size:12px;
        font-weight:900;
        line-height:22px;
        display:flex;
        align-items:center;
        justify-content:center;
      ">${order}</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

const pickupIcon = createColoredIcon("#2563eb", "P");
const deliveryIcon = createColoredIcon("#16a34a", "D");
const liveIcon = createColoredIcon("#f97316", "L");
const defaultCenter: LatLngExpression = [53.5, -2.5];

function FitMapToMarkers({ points }: { points: LatLngExpression[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 9);
      return;
    }

    map.fitBounds(points as LatLngBoundsExpression, { padding: [40, 40] });
  }, [map, points]);

  return null;
}

function statusPillStyle(status: string | null | undefined): React.CSSProperties {
  const v = String(status ?? "").toLowerCase();

  if (v === "planned") {
    return {
      background: "rgba(0,120,255,0.10)",
      color: "#0b57d0",
      border: "1px solid rgba(0,120,255,0.18)",
    };
  }

  if (v === "confirmed") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.22)",
    };
  }

  if (v === "in_progress") {
    return {
      background: "rgba(170,0,255,0.10)",
      color: "#6a1b9a",
      border: "1px solid rgba(170,0,255,0.18)",
    };
  }

  if (v === "completed") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (v === "cancelled") {
    return {
      background: "rgba(255,0,0,0.10)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.18)",
    };
  }

  return {
    background: "rgba(255,255,255,0.60)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

function ageText(value: string | null | undefined) {
  if (!value) return "—";
  const now = Date.now();
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "—";
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function mapsUrl(lat: number | null, lng: number | null, address?: string | null) {
  if (typeof lat === "number" && typeof lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  return "#";
}

function jobTouchesDate(item: TransportItem, selectedDate: string) {
  const start = String(item.transport_date ?? "");
  const end = String(item.delivery_date ?? item.transport_date ?? "");

  if (!selectedDate || !start) return true;

  return start <= selectedDate && end >= selectedDate;
}

function effectiveDeliveryDate(item: TransportItem) {
  return item.delivery_date || item.transport_date || null;
}

function scheduleText(item: TransportItem) {
  const startDate = fmtDate(item.transport_date);
  const endDate =
    item.delivery_date && item.delivery_date !== item.transport_date
      ? fmtDate(item.delivery_date)
      : null;

  const startTime = item.collection_time ?? "—";
  const endTime = item.delivery_time ?? "—";

  return `${startDate}${endDate ? ` → ${endDate}` : ""} • ${startTime} → ${endTime}`;
}

function routeOrderSummary(stops: RouteStop[]) {
  if (stops.length === 0) return "—";
  return stops
    .map((stop) => `#${stop.stopOrder} ${prettyStopType(stop.stopType)}`)
    .join(" • ");
}

export default function TransportMapClient() {
  const [items, setItems] = useState<TransportItem[]>([]);
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [routeMessage, setRouteMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [routePlannerStops, setRoutePlannerStops] = useState<RouteStop[]>([]);
  const [routeDirty, setRouteDirty] = useState(false);
  const [routedSegments, setRoutedSegments] = useState<Record<string, LatLngExpression[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowserClient();

    const [jobsRes, locationsRes] = await Promise.all([
      supabase
        .from("transport_jobs")
        .select(`
          id,
          transport_number,
          transport_date,
          collection_time,
          delivery_date,
          delivery_time,
          collection_address,
          delivery_address,
          collection_lat,
          collection_lng,
          delivery_lat,
          delivery_lng,
          collection_route_order,
          delivery_route_order,
          status,
          job_type,
          load_description,
          price,
          agreed_sell_rate,
          vehicle_id,
          operator_id,
          linked_job_id,
          archived,
          vehicles:vehicle_id (
            name,
            reg_number,
            status
          ),
          operators:operator_id (
            full_name
          ),
          jobs:linked_job_id (
            id,
            job_number,
            site_name,
            job_date
          ),
          clients:client_id (
            company_name
          )
        `)
        .eq("archived", false)
        .order("transport_date", { ascending: true })
        .order("collection_time", { ascending: true }),

      supabase
        .from("driver_locations")
        .select(`
          id,
          transport_job_id,
          operator_id,
          vehicle_id,
          lat,
          lng,
          recorded_at
        `)
        .order("recorded_at", { ascending: false })
        .limit(500),
    ]);

    if (jobsRes.error) {
      setError(jobsRes.error.message);
      setItems([]);
      setLocations([]);
      setLoading(false);
      return;
    }

    if (locationsRes.error) {
      setError(`Live tracking error: ${locationsRes.error.message}`);
    }

    setItems((jobsRes.data ?? []) as TransportItem[]);
    setLocations((locationsRes.data ?? []) as DriverLocation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const intervalId = window.setInterval(load, 30000);
    return () => window.clearInterval(intervalId);
  }, [load]);

  const latestLocationByJob = useMemo(() => {
    const map = new Map<string, DriverLocation>();

    for (const loc of locations) {
      if (!loc.transport_job_id) continue;
      if (!map.has(loc.transport_job_id)) {
        map.set(loc.transport_job_id, loc);
      }
    }

    return map;
  }, [locations]);

  const vehicleOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const item of items) {
      const vehicle = first(item.vehicles);
      if (item.vehicle_id && vehicle?.name) {
        map.set(
          item.vehicle_id,
          `${vehicle.name}${vehicle.reg_number ? ` (${vehicle.reg_number})` : ""}`
        );
      }
    }

    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const itemStatus = String(item.status ?? "").toLowerCase();
      const statusOk =
        statusFilter === "all"
          ? itemStatus !== "cancelled"
          : itemStatus === statusFilter;

      const dateOk = !dateFilter || jobTouchesDate(item, dateFilter);

      const vehicleOk =
        vehicleFilter === "all" || String(item.vehicle_id ?? "") === vehicleFilter;

      const jobTypeOk =
        jobTypeFilter === "all" ||
        String(item.job_type ?? "").toLowerCase() === jobTypeFilter;

      const hasLiveLocation = latestLocationByJob.has(item.id);
      const coordsOk =
        hasCoords(item.collection_lat, item.collection_lng) ||
        hasCoords(item.delivery_lat, item.delivery_lng) ||
        hasLiveLocation;

      return statusOk && dateOk && vehicleOk && jobTypeOk && coordsOk;
    });
  }, [
    items,
    statusFilter,
    dateFilter,
    vehicleFilter,
    jobTypeFilter,
    latestLocationByJob,
  ]);

  const derivedRouteStops = useMemo(() => {
    if (!dateFilter || vehicleFilter === "all") return [] as RouteStop[];

    const baseStops: RouteStop[] = [];

    for (const item of items) {
      if (String(item.vehicle_id ?? "") !== vehicleFilter) continue;
      if (String(item.status ?? "").toLowerCase() === "cancelled") continue;

      const client = first(item.clients);
      const vehicle = first(item.vehicles);
      const driver = first(item.operators);
      const linkedJob = first(item.jobs);

      if (item.transport_date === dateFilter) {
        baseStops.push({
          key: `${item.id}:pickup`,
          transportJobId: item.id,
          stopType: "pickup",
          stopOrder: item.collection_route_order ?? 0,
          routeDate: dateFilter,
          plannedTime: item.collection_time ?? null,
          customerName: client?.company_name ?? "Customer",
          transportNumber: item.transport_number ?? "Transport Job",
          address: item.collection_address ?? null,
          lat: item.collection_lat ?? null,
          lng: item.collection_lng ?? null,
          status: item.status ?? null,
          vehicleId: item.vehicle_id ?? null,
          vehicleLabel: `${vehicle?.name ?? "Vehicle"}${
            vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""
          }`,
          driverName: driver?.full_name ?? "—",
          linkedJobLabel: linkedJob?.job_number ? `#${linkedJob.job_number}` : "—",
        });
      }

      if (effectiveDeliveryDate(item) === dateFilter) {
        baseStops.push({
          key: `${item.id}:delivery`,
          transportJobId: item.id,
          stopType: "delivery",
          stopOrder: item.delivery_route_order ?? 0,
          routeDate: dateFilter,
          plannedTime: item.delivery_time ?? null,
          customerName: client?.company_name ?? "Customer",
          transportNumber: item.transport_number ?? "Transport Job",
          address: item.delivery_address ?? null,
          lat: item.delivery_lat ?? null,
          lng: item.delivery_lng ?? null,
          status: item.status ?? null,
          vehicleId: item.vehicle_id ?? null,
          vehicleLabel: `${vehicle?.name ?? "Vehicle"}${
            vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""
          }`,
          driverName: driver?.full_name ?? "—",
          linkedJobLabel: linkedJob?.job_number ? `#${linkedJob.job_number}` : "—",
        });
      }
    }

    const sorted = [...baseStops].sort((a, b) => {
      if (a.stopOrder && b.stopOrder && a.stopOrder !== b.stopOrder) {
        return a.stopOrder - b.stopOrder;
      }

      if (a.stopOrder && !b.stopOrder) return -1;
      if (!a.stopOrder && b.stopOrder) return 1;

      const timeA = a.plannedTime || "99:99";
      const timeB = b.plannedTime || "99:99";
      if (timeA !== timeB) return timeA.localeCompare(timeB);

      if (a.stopType !== b.stopType) {
        return a.stopType === "pickup" ? -1 : 1;
      }

      return `${a.customerName} ${a.transportNumber}`.localeCompare(
        `${b.customerName} ${b.transportNumber}`
      );
    });

    return sorted.map((stop, index) => ({
      ...stop,
      stopOrder: index + 1,
    }));
  }, [items, vehicleFilter, dateFilter]);

  useEffect(() => {
    if (!routeDirty) {
      setRoutePlannerStops(derivedRouteStops);
    }
  }, [derivedRouteStops, routeDirty]);

  const routedSegmentRequests = useMemo(() => {
    const requests: Array<{ key: string; fromLat: number; fromLng: number; toLat: number; toLng: number }> = [];

    if (routePlannerStops.length > 1) {
      const orderedStops = [...routePlannerStops].filter((stop) => hasCoords(stop.lat, stop.lng)).sort((a, b) => a.stopOrder - b.stopOrder);
      for (let i = 0; i < orderedStops.length - 1; i++) {
        const from = orderedStops[i];
        const to = orderedStops[i + 1];
        requests.push({
          key: `route:${from.key}:${to.key}`,
          fromLat: Number(from.lat),
          fromLng: Number(from.lng),
          toLat: Number(to.lat),
          toLng: Number(to.lng),
        });
      }
      return requests;
    }

    filtered.forEach((item) => {
      if (!hasCoords(item.collection_lat, item.collection_lng) || !hasCoords(item.delivery_lat, item.delivery_lng)) return;
      requests.push({
        key: `job:${item.id}`,
        fromLat: Number(item.collection_lat),
        fromLng: Number(item.collection_lng),
        toLat: Number(item.delivery_lat),
        toLng: Number(item.delivery_lng),
      });
    });

    return requests;
  }, [filtered, routePlannerStops]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoutes() {
      if (!routedSegmentRequests.length) {
        if (!cancelled) setRoutedSegments({});
        return;
      }

      const next: Record<string, LatLngExpression[]> = {};

      for (const req of routedSegmentRequests) {
        try {
          const res = await fetch("/api/transport-route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fromLat: req.fromLat, fromLng: req.fromLng, toLat: req.toLat, toLng: req.toLng }),
          });
          const json = await res.json().catch(() => null);
          const path = Array.isArray(json?.path) ? json.path : [];
          next[req.key] = path.length > 1 ? path as LatLngExpression[] : [asLatLng(req.fromLat, req.fromLng), asLatLng(req.toLat, req.toLng)];
        } catch {
          next[req.key] = [asLatLng(req.fromLat, req.fromLng), asLatLng(req.toLat, req.toLng)];
        }
      }

      if (!cancelled) setRoutedSegments(next);
    }

    loadRoutes();
    return () => { cancelled = true; };
  }, [routedSegmentRequests]);

  const orderedRoutePoints = useMemo(() => {
    return routePlannerStops
      .filter((stop) => hasCoords(stop.lat, stop.lng))
      .sort((a, b) => a.stopOrder - b.stopOrder)
      .map((stop) => asLatLng(Number(stop.lat), Number(stop.lng)));
  }, [routePlannerStops]);

  const mapPoints = useMemo<LatLngExpression[]>(() => {
    const points: LatLngExpression[] = [];

    for (const item of filtered) {
      if (hasCoords(item.collection_lat, item.collection_lng)) {
        points.push(asLatLng(item.collection_lat as number, item.collection_lng as number));
      }

      if (hasCoords(item.delivery_lat, item.delivery_lng)) {
        points.push(asLatLng(item.delivery_lat as number, item.delivery_lng as number));
      }

      const live = latestLocationByJob.get(item.id);
      if (live && isLikelyUkPoint(Number(live.lat), Number(live.lng))) {
        points.push(asLatLng(Number(live.lat), Number(live.lng)));
      }
    }

    for (const point of orderedRoutePoints) {
      points.push(point);
    }

    return points;
  }, [filtered, latestLocationByJob, orderedRoutePoints]);

  const plannedCount = filtered.filter(
    (x) => String(x.status ?? "").toLowerCase() === "planned"
  ).length;
  const confirmedCount = filtered.filter(
    (x) => String(x.status ?? "").toLowerCase() === "confirmed"
  ).length;
  const inProgressCount = filtered.filter(
    (x) => String(x.status ?? "").toLowerCase() === "in_progress"
  ).length;
  const completedCount = filtered.filter(
    (x) => String(x.status ?? "").toLowerCase() === "completed"
  ).length;

  function renumberStops(stops: RouteStop[]) {
    return stops.map((stop, index) => ({
      ...stop,
      stopOrder: index + 1,
    }));
  }

  function moveStop(index: number, direction: -1 | 1) {
    setRoutePlannerStops((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;

      const next = [...current];
      const temp = next[index];
      next[index] = next[nextIndex];
      next[nextIndex] = temp;

      return renumberStops(next);
    });

    setRouteDirty(true);
    setRouteMessage("");
  }

  async function saveRoute() {
    if (!dateFilter || vehicleFilter === "all" || routePlannerStops.length === 0) return;

    setSaving(true);
    setRouteMessage("");
    setError("");

    try {
      const res = await fetch("/api/transport-route-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vehicle_id: vehicleFilter,
          route_date: dateFilter,
          stops: routePlannerStops.map((stop, index) => ({
            transport_job_id: stop.transportJobId,
            stop_type: stop.stopType,
            stop_order: index + 1,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Could not save route order.");
        setSaving(false);
        return;
      }

      await load();
      setRouteDirty(false);
      setRouteMessage("Route order saved for office and operator view.");
    } catch {
      setError("Could not save route order.");
    } finally {
      setSaving(false);
    }
  }

  async function resetRoute() {
    if (!dateFilter || vehicleFilter === "all") return;

    setSaving(true);
    setRouteMessage("");
    setError("");

    try {
      const res = await fetch("/api/transport-route-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vehicle_id: vehicleFilter,
          route_date: dateFilter,
          stops: [],
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Could not reset route order.");
        setSaving(false);
        return;
      }

      await load();
      setRouteDirty(false);
      setRouteMessage("Saved route order cleared.");
    } catch {
      setError("Could not reset route order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={toolbarStyle}>
        <div style={filtersGrid}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={labelStyle}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="all">all</option>
              <option value="planned">planned</option>
              <option value="confirmed">confirmed</option>
              <option value="in_progress">in_progress</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setRouteDirty(false);
                setRouteMessage("");
              }}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={labelStyle}>Vehicle</label>
            <select
              value={vehicleFilter}
              onChange={(e) => {
                setVehicleFilter(e.target.value);
                setRouteDirty(false);
                setRouteMessage("");
              }}
              style={inputStyle}
            >
              <option value="all">all</option>
              {vehicleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={labelStyle}>Job Type</label>
            <select
              value={jobTypeFilter}
              onChange={(e) => setJobTypeFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="all">all</option>
              <option value="haulage">haulage</option>
              <option value="delivery">delivery</option>
              <option value="collection">collection</option>
              <option value="ballast">ballast</option>
              <option value="crane_support">crane_support</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setDateFilter("");
              setVehicleFilter("all");
              setJobTypeFilter("all");
              setRouteDirty(false);
              setRouteMessage("");
            }}
            style={clearBtn}
          >
            Clear filters
          </button>
        </div>

        <div style={statsWrap}>
          <Stat label="Shown" value={String(filtered.length)} />
          <Stat label="Planned" value={String(plannedCount)} />
          <Stat label="Confirmed" value={String(confirmedCount)} />
          <Stat label="In Progress" value={String(inProgressCount)} />
          <Stat label="Completed" value={String(completedCount)} />
        </div>

        <div style={infoSubBox}>
          Select a <strong>date</strong> and <strong>vehicle</strong> to build a route order that drivers can see.
        </div>

        {routeMessage ? <div style={infoSubBox}>{routeMessage}</div> : null}
      </div>

      {loading ? (
        <div style={infoBox}>Loading transport control screen...</div>
      ) : error ? (
        <div style={errorBox}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={infoBox}>No mapped transport jobs found.</div>
      ) : (
        <div style={contentGrid}>
          <div style={mapWrap}>
            <SafeMapContainer
              center={defaultCenter}
              zoom={6}
              scrollWheelZoom={true}
              style={{ width: "100%", height: "100%", borderRadius: 14 }}
            >
              <SafeTileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <FitMapToMarkers points={mapPoints} />

              {filtered.map((item) => {
                const client = first(item.clients);
                const vehicle = first(item.vehicles);
                const driver = first(item.operators);
                const linkedJob = first(item.jobs);
                const live = latestLocationByJob.get(item.id);

                const pickupPoint: LatLngExpression | null = hasCoords(
                  item.collection_lat,
                  item.collection_lng
                )
                  ? asLatLng(Number(item.collection_lat), Number(item.collection_lng))
                  : null;

                const deliveryPoint: LatLngExpression | null = hasCoords(
                  item.delivery_lat,
                  item.delivery_lng
                )
                  ? asLatLng(Number(item.delivery_lat), Number(item.delivery_lng))
                  : null;

                const livePoint: LatLngExpression | null =
                  live && isLikelyUkPoint(Number(live.lat), Number(live.lng))
                    ? asLatLng(Number(live.lat), Number(live.lng))
                    : null;

                return (
                  <div key={item.id}>
                    {pickupPoint ? (
                      <SafeMarker position={pickupPoint} icon={pickupIcon}>
                        <SafePopup>
                          <div style={{ minWidth: 280 }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>Pickup</div>
                            <div><strong>Ref:</strong> {item.transport_number ?? "—"}</div>
                            <div><strong>Customer:</strong> {client?.company_name ?? "—"}</div>
                            <div><strong>Schedule:</strong> {scheduleText(item)}</div>
                            <div><strong>Vehicle:</strong> {vehicle?.name ?? "—"}{vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}</div>
                            <div><strong>Driver:</strong> {driver?.full_name ?? "—"}</div>
                            <div><strong>Status:</strong> {prettyStatus(item.status)}</div>
                            <div><strong>Linked Crane Job:</strong> {linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}</div>
                          </div>
                        </SafePopup>
                      </SafeMarker>
                    ) : null}

                    {deliveryPoint ? (
                      <SafeMarker position={deliveryPoint} icon={deliveryIcon}>
                        <SafePopup>
                          <div style={{ minWidth: 280 }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>Delivery</div>
                            <div><strong>Ref:</strong> {item.transport_number ?? "—"}</div>
                            <div><strong>Customer:</strong> {client?.company_name ?? "—"}</div>
                            <div><strong>Schedule:</strong> {scheduleText(item)}</div>
                            <div><strong>Vehicle:</strong> {vehicle?.name ?? "—"}{vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}</div>
                            <div><strong>Driver:</strong> {driver?.full_name ?? "—"}</div>
                            <div><strong>Status:</strong> {prettyStatus(item.status)}</div>
                            <div><strong>Linked Crane Job:</strong> {linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}</div>
                          </div>
                        </SafePopup>
                      </SafeMarker>
                    ) : null}

                    {livePoint ? (
                      <SafeMarker position={livePoint} icon={liveIcon}>
                        <SafePopup>
                          <div style={{ minWidth: 280 }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>Live Driver Location</div>
                            <div><strong>Ref:</strong> {item.transport_number ?? "—"}</div>
                            <div><strong>Driver:</strong> {driver?.full_name ?? "—"}</div>
                            <div><strong>Vehicle:</strong> {vehicle?.name ?? "—"}{vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}</div>
                            <div><strong>Last update:</strong> {ageText(live.recorded_at)}</div>
                          </div>
                        </SafePopup>
                      </SafeMarker>
                    ) : null}
                  </div>
                );
              })}

              {routePlannerStops.length > 1
                ? routedSegmentRequests.map((segment) => {
                    const positions = routedSegments[segment.key] ?? [asLatLng(segment.fromLat, segment.fromLng), asLatLng(segment.toLat, segment.toLng)];
                    return positions.length > 1 ? (
                      <SafePolyline key={segment.key} positions={positions} pathOptions={{ color: "#ef4444", weight: 4, opacity: 0.85 }} />
                    ) : null;
                  })
                : filtered.map((item) => {
                    if (!hasCoords(item.collection_lat, item.collection_lng) || !hasCoords(item.delivery_lat, item.delivery_lng)) return null;
                    const positions = routedSegments[`job:${item.id}`] ?? [asLatLng(Number(item.collection_lat), Number(item.collection_lng)), asLatLng(Number(item.delivery_lat), Number(item.delivery_lng))];
                    return positions.length > 1 ? (
                      <SafePolyline key={`job-route-${item.id}`} positions={positions} pathOptions={{ color: "#ef4444", weight: 3, opacity: 0.65 }} />
                    ) : null;
                  })}

              {routePlannerStops.map((stop) => {
                if (!hasCoords(stop.lat, stop.lng)) return null;

                return (
                  <SafeMarker
                    key={`route-stop-${stop.key}`}
                    position={asLatLng(Number(stop.lat), Number(stop.lng))}
                    icon={createRouteStopIcon(stop.stopOrder, stop.stopType)}
                  >
                    <SafePopup>
                      <div style={{ minWidth: 260 }}>
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>
                          Stop #{stop.stopOrder} • {prettyStopType(stop.stopType)}
                        </div>
                        <div><strong>Customer:</strong> {stop.customerName}</div>
                        <div><strong>Ref:</strong> {stop.transportNumber}</div>
                        <div><strong>Time:</strong> {stop.plannedTime ?? "—"}</div>
                        <div><strong>Address:</strong> {stop.address ?? "—"}</div>
                        <div><strong>Vehicle:</strong> {stop.vehicleLabel}</div>
                        <div><strong>Driver:</strong> {stop.driverName}</div>
                      </div>
                    </SafePopup>
                  </SafeMarker>
                );
              })}
            </SafeMapContainer>
          </div>

          <div style={rightColumnWrap}>
            <div style={plannerWrap}>
              <h2 style={{ marginTop: 0, fontSize: 22 }}>Route Planner</h2>

              {!dateFilter || vehicleFilter === "all" ? (
                <div style={infoBox}>
                  Select both a <strong>date</strong> and a <strong>vehicle</strong> to order the stops.
                </div>
              ) : routePlannerStops.length === 0 ? (
                <div style={infoBox}>No pickup or delivery stops found for this vehicle on that date.</div>
              ) : (
                <>
                  <div style={{ marginTop: 8, marginBottom: 12, fontSize: 13, opacity: 0.78 }}>
                    Order the route below. This order is saved and shown to the driver.
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={saveRoute}
                      disabled={saving}
                      style={saveBtn}
                    >
                      {saving ? "Saving..." : "Save route order"}
                    </button>

                    <button
                      type="button"
                      onClick={resetRoute}
                      disabled={saving}
                      style={resetBtn}
                    >
                      Reset route order
                    </button>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {routePlannerStops.map((stop, index) => (
                      <div key={stop.key} style={routeCard}>
                        <div style={routeTopRow}>
                          <div style={routeNumber}>{stop.stopOrder}</div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 900, fontSize: 15 }}>
                              {stop.customerName}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                              {stop.transportNumber} • {prettyStopType(stop.stopType)} • {stop.plannedTime ?? "—"}
                            </div>
                          </div>

                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 900,
                              ...(stop.stopType === "pickup"
                                ? {
                                    background: "rgba(37,99,235,0.10)",
                                    border: "1px solid rgba(37,99,235,0.22)",
                                    color: "#1d4ed8",
                                  }
                                : {
                                    background: "rgba(22,163,74,0.10)",
                                    border: "1px solid rgba(22,163,74,0.22)",
                                    color: "#15803d",
                                  }),
                            }}
                          >
                            {prettyStopType(stop.stopType)}
                          </span>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 13 }}>
                          <strong>Address:</strong> {stop.address ?? "—"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13 }}>
                          <strong>Driver:</strong> {stop.driverName}
                        </div>

                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => moveStop(index, -1)}
                            disabled={index === 0}
                            style={index === 0 ? disabledMiniBtn : miniBtn}
                          >
                            Move up
                          </button>

                          <button
                            type="button"
                            onClick={() => moveStop(index, 1)}
                            disabled={index === routePlannerStops.length - 1}
                            style={
                              index === routePlannerStops.length - 1
                                ? disabledMiniBtn
                                : miniBtn
                            }
                          >
                            Move down
                          </button>

                          <a
                            href={mapsUrl(stop.lat, stop.lng, stop.address)}
                            target="_blank"
                            rel="noreferrer"
                            style={miniLinkBtn}
                          >
                            Navigate
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={listWrap}>
              <h2 style={{ marginTop: 0, fontSize: 22 }}>Dispatch List</h2>

              <div style={{ display: "grid", gap: 10 }}>
                {filtered.map((item) => {
                  const client = first(item.clients);
                  const vehicle = first(item.vehicles);
                  const driver = first(item.operators);
                  const linkedJob = first(item.jobs);
                  const live = latestLocationByJob.get(item.id);
                  const itemRouteStops = routePlannerStops.filter(
                    (stop) => stop.transportJobId === item.id
                  );

                  return (
                    <div key={item.id} style={jobCard}>
                      <div style={jobTopRow}>
                        <div style={{ fontWeight: 1000 }}>
                          {client?.company_name ?? item.transport_number ?? "Transport Job"}
                        </div>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 8px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            ...statusPillStyle(item.status),
                          }}
                        >
                          {prettyStatus(item.status)}
                        </span>
                      </div>

                      <div style={{ marginTop: 6, opacity: 0.78 }}>
                        {item.transport_number ?? "—"} • {prettyJobType(item.job_type)}
                      </div>

                      <div style={{ marginTop: 6, fontSize: 13 }}>
                        <strong>Schedule:</strong> {scheduleText(item)}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Vehicle:</strong> {vehicle?.name ?? "—"}{vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Driver:</strong> {driver?.full_name ?? "—"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Pickup:</strong> {item.collection_address ?? "—"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Delivery:</strong> {item.delivery_address ?? "—"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Live update:</strong> {live ? ageText(live.recorded_at) : "No live tracking"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Load:</strong> {item.load_description ?? "—"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Value:</strong> {fmtMoney(item.agreed_sell_rate ?? item.price)}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Linked Crane Job:</strong> {linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        <strong>Route order:</strong> {routeOrderSummary(itemRouteStops)}
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <a href={`/transport-jobs/${item.id}`} style={linkBtn}>
                          Open transport job
                        </a>

                        {item.vehicle_id ? (
                          <a href={`/vehicles/${item.vehicle_id}`} style={linkBtn}>
                            Open vehicle
                          </a>
                        ) : null}

                        {linkedJob?.id ? (
                          <a href={`/jobs/${linkedJob.id}`} style={linkBtn}>
                            Open crane job
                          </a>
                        ) : null}

                        <a
                          href={mapsUrl(item.collection_lat, item.collection_lng, item.collection_address)}
                          target="_blank"
                          rel="noreferrer"
                          style={linkBtn}
                        >
                          Pickup nav
                        </a>

                        <a
                          href={mapsUrl(item.delivery_lat, item.delivery_lng, item.delivery_address)}
                          target="_blank"
                          rel="noreferrer"
                          style={linkBtn}
                        >
                          Delivery nav
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={statBox}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  background: "rgba(255,255,255,0.28)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 14,
};

const filtersGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const statsWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 10,
};

const statBox: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const statLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 800,
};

const statValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 1000,
  fontSize: 20,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  width: "100%",
};

const clearBtn: React.CSSProperties = {
  height: 42,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const contentGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.25fr 0.9fr",
  gap: 14,
  alignItems: "start",
};

const mapWrap: React.CSSProperties = {
  height: "76vh",
  minHeight: 560,
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
};

const rightColumnWrap: React.CSSProperties = {
  display: "grid",
  gap: 14,
  maxHeight: "76vh",
  minHeight: 560,
};

const plannerWrap: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.28)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflowY: "auto",
};

const listWrap: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.28)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflowY: "auto",
};

const routeCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.58)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const routeTopRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
};

const routeNumber: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  background: "#111",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
  fontSize: 13,
  flexShrink: 0,
};

const saveBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const resetBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 9,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const disabledMiniBtn: React.CSSProperties = {
  ...miniBtn,
  opacity: 0.5,
  cursor: "not-allowed",
};

const miniLinkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const jobCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.58)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const jobTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const linkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "rgba(255,255,255,0.72)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const infoBox: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  lineHeight: 1.5,
};

const infoSubBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  lineHeight: 1.45,
  fontSize: 13,
};

const errorBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
