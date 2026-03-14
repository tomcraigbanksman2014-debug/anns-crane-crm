"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Polyline,
  useMap,
} from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

type TransportItem = {
  id: string;
  transport_number: string | null;
  transport_date: string | null;
  collection_time: string | null;
  delivery_time: string | null;
  collection_address: string | null;
  delivery_address: string | null;
  collection_lat: number | null;
  collection_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  status: string | null;
  job_type: string | null;
  load_description: string | null;
  price: number | null;
  vehicle_id: string | null;
  operator_id: string | null;
  linked_job_id: string | null;
  vehicles:
    | { name: string | null; reg_number: string | null; status?: string | null }
    | { name: string | null; reg_number: string | null; status?: string | null }[]
    | null;
  operators:
    | { full_name: string | null }
    | { full_name: string | null }[]
    | null;
  jobs:
    | { id: string; job_number: string | number | null; site_name: string | null; job_date?: string | null }
    | { id: string; job_number: string | number | null; site_name: string | null; job_date?: string | null }[]
    | null;
  clients:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null;
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

function hasCoords(lat: number | null, lng: number | null) {
  return typeof lat === "number" && typeof lng === "number";
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

const pickupIcon = createColoredIcon("#2563eb", "P");
const deliveryIcon = createColoredIcon("#16a34a", "D");
const defaultCenter: LatLngExpression = [53.5, -2.5];

function FitMapToMarkers({
  points,
}: {
  points: LatLngExpression[];
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 9);
      return;
    }

    map.fitBounds(points as L.LatLngBoundsExpression, { padding: [40, 40] });
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

export default function TransportMapClient() {
  const [items, setItems] = useState<TransportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("transport_jobs")
        .select(`
          id,
          transport_number,
          transport_date,
          collection_time,
          delivery_time,
          collection_address,
          delivery_address,
          collection_lat,
          collection_lng,
          delivery_lat,
          delivery_lng,
          status,
          job_type,
          load_description,
          price,
          vehicle_id,
          operator_id,
          linked_job_id,
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
        .order("transport_date", { ascending: true })
        .order("collection_time", { ascending: true });

      if (!active) return;

      if (error) {
        setError(error.message);
        setItems([]);
      } else {
        setItems((data ?? []) as TransportItem[]);
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []);

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
      const statusOk =
        statusFilter === "all" ||
        String(item.status ?? "").toLowerCase() === statusFilter;

      const dateOk =
        !dateFilter || String(item.transport_date ?? "") === dateFilter;

      const vehicleOk =
        vehicleFilter === "all" || String(item.vehicle_id ?? "") === vehicleFilter;

      const jobTypeOk =
        jobTypeFilter === "all" ||
        String(item.job_type ?? "").toLowerCase() === jobTypeFilter;

      const coordsOk =
        hasCoords(item.collection_lat, item.collection_lng) ||
        hasCoords(item.delivery_lat, item.delivery_lng);

      return statusOk && dateOk && vehicleOk && jobTypeOk && coordsOk;
    });
  }, [items, statusFilter, dateFilter, vehicleFilter, jobTypeFilter]);

  const mapPoints = useMemo<LatLngExpression[]>(() => {
    const points: LatLngExpression[] = [];

    for (const item of filtered) {
      if (hasCoords(item.collection_lat, item.collection_lng)) {
        points.push(asLatLng(item.collection_lat as number, item.collection_lng as number));
      }

      if (hasCoords(item.delivery_lat, item.delivery_lng)) {
        points.push(asLatLng(item.delivery_lat as number, item.delivery_lng as number));
      }
    }

    return points;
  }, [filtered]);

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
              onChange={(e) => setDateFilter(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={labelStyle}>Vehicle</label>
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
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
      </div>

      {loading ? (
        <div style={infoBox}>Loading transport control screen...</div>
      ) : error ? (
        <div style={errorBox}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={infoBox}>
          No mapped transport jobs found.
          <br />
          Each transport job needs coordinates in:
          <br />
          `collection_lat`, `collection_lng`, `delivery_lat`, `delivery_lng`
        </div>
      ) : (
        <div style={contentGrid}>
          <div style={mapWrap}>
            <MapContainer
              center={defaultCenter}
              zoom={6}
              scrollWheelZoom={true}
              style={{ width: "100%", height: "100%", borderRadius: 14 }}
            >
              <TileLayer
                attribution={`&copy; OpenStreetMap contributors`}
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <FitMapToMarkers points={mapPoints} />

              {filtered.map((item) => {
                const client = first(item.clients);
                const vehicle = first(item.vehicles);
                const driver = first(item.operators);
                const linkedJob = first(item.jobs);

                const pickupPoint: LatLngExpression | null = hasCoords(
                  item.collection_lat,
                  item.collection_lng
                )
                  ? asLatLng(item.collection_lat as number, item.collection_lng as number)
                  : null;

                const deliveryPoint: LatLngExpression | null = hasCoords(
                  item.delivery_lat,
                  item.delivery_lng
                )
                  ? asLatLng(item.delivery_lat as number, item.delivery_lng as number)
                  : null;

                return (
                  <div key={item.id}>
                    {pickupPoint ? (
                      <Marker position={pickupPoint} icon={pickupIcon}>
                        <Popup>
                          <div style={{ minWidth: 240 }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>Pickup</div>
                            <div><strong>Ref:</strong> {item.transport_number ?? "—"}</div>
                            <div><strong>Customer:</strong> {client?.company_name ?? "—"}</div>
                            <div><strong>Vehicle:</strong> {vehicle?.name ?? "—"}{vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}</div>
                            <div><strong>Driver:</strong> {driver?.full_name ?? "—"}</div>
                            <div><strong>Status:</strong> {prettyStatus(item.status)}</div>
                            <div><strong>Type:</strong> {prettyJobType(item.job_type)}</div>
                            <div><strong>Date:</strong> {fmtDate(item.transport_date)}</div>
                            <div><strong>Time:</strong> {item.collection_time ?? "—"}</div>
                            <div><strong>Pickup:</strong> {item.collection_address ?? "—"}</div>
                            <div><strong>Delivery:</strong> {item.delivery_address ?? "—"}</div>
                            <div><strong>Linked Crane Job:</strong> {linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}</div>
                          </div>
                        </Popup>
                      </Marker>
                    ) : null}

                    {deliveryPoint ? (
                      <Marker position={deliveryPoint} icon={deliveryIcon}>
                        <Popup>
                          <div style={{ minWidth: 240 }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>Delivery</div>
                            <div><strong>Ref:</strong> {item.transport_number ?? "—"}</div>
                            <div><strong>Customer:</strong> {client?.company_name ?? "—"}</div>
                            <div><strong>Vehicle:</strong> {vehicle?.name ?? "—"}{vehicle?.reg_number ? ` (${vehicle.reg_number})` : ""}</div>
                            <div><strong>Driver:</strong> {driver?.full_name ?? "—"}</div>
                            <div><strong>Status:</strong> {prettyStatus(item.status)}</div>
                            <div><strong>Type:</strong> {prettyJobType(item.job_type)}</div>
                            <div><strong>Date:</strong> {fmtDate(item.transport_date)}</div>
                            <div><strong>Time:</strong> {item.delivery_time ?? "—"}</div>
                            <div><strong>Pickup:</strong> {item.collection_address ?? "—"}</div>
                            <div><strong>Delivery:</strong> {item.delivery_address ?? "—"}</div>
                            <div><strong>Linked Crane Job:</strong> {linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}</div>
                          </div>
                        </Popup>
                      </Marker>
                    ) : null}

                    {pickupPoint && deliveryPoint ? (
                      <Polyline
                        positions={[pickupPoint, deliveryPoint]}
                        pathOptions={{ color: "#111", weight: 3, opacity: 0.6 }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </MapContainer>
          </div>

          <div style={listWrap}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Dispatch List</h2>

            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((item) => {
                const client = first(item.clients);
                const vehicle = first(item.vehicles);
                const driver = first(item.operators);
                const linkedJob = first(item.jobs);

                return (
                  <div key={item.id} style={jobCard}>
                    <div style={jobTopRow}>
                      <div style={{ fontWeight: 1000 }}>
                        {item.transport_number ?? "Transport Job"}
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
                      {client?.company_name ?? "—"} • {prettyJobType(item.job_type)}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13 }}>
                      <strong>Date:</strong> {fmtDate(item.transport_date)}
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
                      <strong>Load:</strong> {item.load_description ?? "—"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      <strong>Value:</strong> {fmtMoney(item.price)}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      <strong>Linked Crane Job:</strong> {linkedJob?.job_number ? `#${linkedJob.job_number}` : "—"}
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
                    </div>
                  </div>
                );
              })}
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
  gridTemplateColumns: "1.4fr 0.7fr",
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

const listWrap: React.CSSProperties = {
  maxHeight: "76vh",
  minHeight: 560,
  overflowY: "auto",
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.28)",
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

const errorBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
