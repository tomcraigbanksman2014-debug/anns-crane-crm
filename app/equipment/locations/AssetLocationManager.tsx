"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SelectOption = {
  value: string;
  label: string;
};

type LocationEvent = {
  id: string;
  asset_category: string;
  asset_type: string;
  asset_id: string | null;
  asset_label: string;
  ownership_type: string;
  status: string;
  location_name: string | null;
  address: string | null;
  postcode: string | null;
  what3words: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  linked_job_id: string | null;
  linked_transport_job_id: string | null;
  moved_by_vehicle_id: string | null;
  moved_by_operator_id: string | null;
  event_time: string | null;
  collection_due_at: string | null;
  notes: string | null;
  created_by_username: string | null;
  created_at: string | null;
};

type Props = {
  initialEvents: LocationEvent[];
  equipmentOptions: SelectOption[];
  vehicleOptions: SelectOption[];
  craneOptions: SelectOption[];
  jobOptions: SelectOption[];
  transportJobOptions: SelectOption[];
  operatorOptions: SelectOption[];
};

type Draft = {
  asset_category: string;
  asset_id: string;
  asset_label: string;
  ownership_type: string;
  status: string;
  location_name: string;
  address: string;
  postcode: string;
  what3words: string;
  latitude: string;
  longitude: string;
  linked_job_id: string;
  linked_transport_job_id: string;
  moved_by_vehicle_id: string;
  moved_by_operator_id: string;
  event_time: string;
  collection_due_at: string;
  notes: string;
};

type QuickFilter =
  | "all"
  | "not_in_yard"
  | "dropped_on_site"
  | "in_transit"
  | "in_yard"
  | "overdue";

type GeocodeResult = {
  lat: number;
  lng: number;
  displayName?: string;
};

const CATEGORY_OPTIONS = [
  { value: "trailer", label: "Trailer" },
  { value: "vehicle", label: "Vehicle" },
  { value: "crane", label: "Crane" },
  { value: "mats", label: "Mats" },
  { value: "attachment", label: "Attachment" },
  { value: "rigging_gear", label: "Rigging Gear" },
  { value: "plant_equipment", label: "Plant / Equipment" },
  { value: "other", label: "Other" },
];

const OWNERSHIP_OPTIONS = [
  { value: "owned", label: "Owned" },
  { value: "hired_in", label: "Hired-in" },
  { value: "subcontractor_supplied", label: "Subcontractor supplied" },
  { value: "customer_supplied", label: "Customer supplied" },
  { value: "unknown", label: "Unknown" },
];

const STATUS_OPTIONS = [
  { value: "in_yard", label: "In yard" },
  { value: "dropped_on_site", label: "Dropped on site" },
  { value: "on_job", label: "On job" },
  { value: "in_transit", label: "In transit" },
  { value: "at_supplier_repair", label: "At supplier / repair" },
  { value: "with_subcontractor", label: "With subcontractor" },
  { value: "unknown", label: "Unknown" },
];

function nowLocalDateTime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function emptyDraft(): Draft {
  return {
    asset_category: "trailer",
    asset_id: "",
    asset_label: "",
    ownership_type: "owned",
    status: "dropped_on_site",
    location_name: "",
    address: "",
    postcode: "",
    what3words: "",
    latitude: "",
    longitude: "",
    linked_job_id: "",
    linked_transport_job_id: "",
    moved_by_vehicle_id: "",
    moved_by_operator_id: "",
    event_time: nowLocalDateTime(),
    collection_due_at: "",
    notes: "",
  };
}

function assetTypeForCategory(category: string) {
  if (category === "trailer" || category === "vehicle") return "vehicle";
  if (category === "crane") return "crane";
  if (
    category === "mats" ||
    category === "attachment" ||
    category === "rigging_gear" ||
    category === "plant_equipment"
  ) {
    return "equipment";
  }
  return "other";
}

function categoryLabel(value: string | null | undefined) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label ?? "Other";
}

function ownershipLabel(value: string | null | undefined) {
  return OWNERSHIP_OPTIONS.find((item) => item.value === value)?.label ?? "Unknown";
}

function statusLabel(value: string | null | undefined) {
  return STATUS_OPTIONS.find((item) => item.value === value)?.label ?? "Unknown";
}

function safeText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function asNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function usableCoordinates(row: Pick<LocationEvent, "latitude" | "longitude">) {
  const lat = asNumber(row.latitude);
  const lng = asNumber(row.longitude);

  if (lat === null || lng === null) return null;
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOverdue(value: string | null | undefined) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function eventAssetKey(event: LocationEvent) {
  return `${event.asset_category}:${event.asset_type}:${event.asset_id || event.asset_label}`;
}

function latestByAsset(events: LocationEvent[]) {
  const map = new Map<string, LocationEvent>();

  for (const event of events) {
    const key = eventAssetKey(event);
    if (!map.has(key)) map.set(key, event);
  }

  return Array.from(map.values());
}

function w3wHref(value: string | null | undefined) {
  const cleaned = String(value ?? "").replace(/^\/+/, "").trim();
  if (!cleaned) return "";
  return `https://what3words.com/${encodeURIComponent(cleaned)}`;
}

function statusBadgeStyle(value: string | null | undefined): React.CSSProperties {
  const v = String(value ?? "").toLowerCase();
  if (v === "in_yard") return greenBadge;
  if (v === "dropped_on_site" || v === "on_job") return blueBadge;
  if (v === "in_transit") return purpleBadge;
  if (v === "at_supplier_repair" || v === "with_subcontractor") return amberBadge;
  return greyBadge;
}

function ownershipBadgeStyle(value: string | null | undefined): React.CSSProperties {
  const v = String(value ?? "").toLowerCase();
  if (v === "owned") return greenBadge;
  if (v === "hired_in") return amberBadge;
  if (v === "subcontractor_supplied") return purpleBadge;
  if (v === "customer_supplied") return blueBadge;
  return greyBadge;
}

function geocodeQueryParts(row: LocationEvent) {
  return [row.location_name, row.address, row.postcode]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

function canGeocodeRow(row: LocationEvent) {
  return geocodeQueryParts(row).length > 0;
}

function mapsHref(row: LocationEvent) {
  const coords = usableCoordinates(row);

  if (coords) {
    return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=17/${coords.lat}/${coords.lng}`;
  }

  const w3wLink = w3wHref(row.what3words);
  if (w3wLink) return w3wLink;

  const q = geocodeQueryParts(row).join(" ");
  return q ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}` : "";
}

function quickFilterLabel(value: QuickFilter) {
  if (value === "not_in_yard") return "Not in yard";
  if (value === "dropped_on_site") return "Dropped on site";
  if (value === "in_transit") return "In transit";
  if (value === "in_yard") return "In yard";
  if (value === "overdue") return "Overdue collection";
  return "Assets tracked";
}

function rowMatchesQuickFilter(row: LocationEvent, filter: QuickFilter) {
  if (filter === "all") return true;
  if (filter === "not_in_yard") return row.status !== "in_yard";
  if (filter === "dropped_on_site") return row.status === "dropped_on_site";
  if (filter === "in_transit") return row.status === "in_transit";
  if (filter === "in_yard") return row.status === "in_yard";
  if (filter === "overdue") return row.status !== "in_yard" && isOverdue(row.collection_due_at);
  return true;
}

async function geocodeLocation(args: {
  location_name?: string | null;
  address?: string | null;
  postcode?: string | null;
}) {
  const res = await fetch("/api/asset-location-events/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(args),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Could not find map location.");
  }

  const lat = Number(data.latitude);
  const lng = Number(data.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Map lookup did not return valid coordinates.");
  }

  return {
    lat,
    lng,
    displayName: String(data.displayName ?? ""),
  };
}

function ensureLeafletCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("leaflet-css")) return;

  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

function AssetMap({
  rows,
  onPickLocation,
}: {
  rows: LocationEvent[];
  onPickLocation: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const onPickRef = useRef(onPickLocation);

  const [geocodeCache, setGeocodeCache] = useState<Record<string, GeocodeResult | null>>({});
  const geocodeCacheRef = useRef<Record<string, GeocodeResult | null>>({});

  useEffect(() => {
    onPickRef.current = onPickLocation;
  }, [onPickLocation]);

  useEffect(() => {
    geocodeCacheRef.current = geocodeCache;
  }, [geocodeCache]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current || mapRef.current) return;

      ensureLeafletCss();

      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).setView([53.6, -2.5], 6);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);

      map.on("click", (event: any) => {
        if (event?.latlng) {
          onPickRef.current(event.latlng.lat, event.latlng.lng);
        }
      });

      mapRef.current = map;
      layerRef.current = layer;
    }

    init();

    return () => {
      cancelled = true;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function geocodeMissingRows() {
      let lookedUp = 0;

      for (const row of rows) {
        if (cancelled) return;
        if (usableCoordinates(row)) continue;
        if (!canGeocodeRow(row)) continue;

        const key = row.id;
        if (Object.prototype.hasOwnProperty.call(geocodeCacheRef.current, key)) continue;

        if (lookedUp >= 12) return;
        lookedUp += 1;

        try {
          const result = await geocodeLocation({
            location_name: row.location_name,
            address: row.address,
            postcode: row.postcode,
          });

          if (cancelled) return;

          geocodeCacheRef.current = {
            ...geocodeCacheRef.current,
            [key]: result,
          };
          setGeocodeCache({ ...geocodeCacheRef.current });
        } catch {
          if (cancelled) return;

          geocodeCacheRef.current = {
            ...geocodeCacheRef.current,
            [key]: null,
          };
          setGeocodeCache({ ...geocodeCacheRef.current });
        }

        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }

    geocodeMissingRows();

    return () => {
      cancelled = true;
    };
  }, [rows]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;

    if (!L || !map || !layer) return;

    layer.clearLayers();

    const bounds: Array<[number, number]> = [];

    rows.forEach((row) => {
      const savedCoords = usableCoordinates(row);
      const cachedCoords = geocodeCache[row.id];

      const coords = savedCoords || cachedCoords;
      if (!coords) return;

      const { lat, lng } = coords;

      const color =
        row.status === "in_yard"
          ? "#0b7a4b"
          : row.status === "in_transit"
            ? "#4f2bbd"
            : row.status === "at_supplier_repair" || row.status === "with_subcontractor"
              ? "#8a5200"
              : row.status === "unknown"
                ? "#555"
                : "#0b57d0";

      const sourceLine = savedCoords
        ? ""
        : "<br /><em>Pin estimated from address/postcode. Save the location again to store exact coordinates.</em>";

      const popupHtml = [
        `<strong>${row.asset_label}</strong>`,
        `<br />${categoryLabel(row.asset_category)} • ${ownershipLabel(row.ownership_type)}`,
        `<br />${statusLabel(row.status)}`,
        row.location_name ? `<br />${row.location_name}` : "",
        row.postcode ? `<br />${row.postcode}` : "",
        row.what3words ? `<br />///${row.what3words}` : "",
        row.collection_due_at ? `<br /><strong>Collection:</strong> ${fmtDateTime(row.collection_due_at)}` : "",
        sourceLine,
      ].join("");

      L.circleMarker([lat, lng], {
        radius: 8,
        color,
        weight: 3,
        fillColor: color,
        fillOpacity: 0.62,
      }).bindPopup(popupHtml).addTo(layer);

      bounds.push([lat, lng]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    } else {
      map.setView([53.6, -2.5], 6);
    }
  }, [rows, geocodeCache]);

  return (
    <div style={mapWrapStyle}>
      <div ref={containerRef} style={mapStyle} />
      <div style={mapHintStyle}>
        Click the map to fill latitude/longitude for the next update. If no saved pin exists, the CRM will try to estimate one from the address/postcode. What3Words-only records open in What3Words.
      </div>
    </div>
  );
}

export default function AssetLocationManager({
  initialEvents,
  equipmentOptions,
  vehicleOptions,
  craneOptions,
  jobOptions,
  transportJobOptions,
  operatorOptions,
}: Props) {
  const router = useRouter();

  const [events, setEvents] = useState<LocationEvent[]>(initialEvents ?? []);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [selectedAssetKey, setSelectedAssetKey] = useState("");

  const currentLocations = useMemo(() => latestByAsset(events), [events]);

  const quickFilteredLocations = useMemo(() => {
    return currentLocations.filter((row) => rowMatchesQuickFilter(row, quickFilter));
  }, [currentLocations, quickFilter]);

  const quickAssetOptions = useMemo(() => {
    return quickFilteredLocations.map((row) => ({
      value: eventAssetKey(row),
      label: `${row.asset_label} — ${statusLabel(row.status)} — ${safeText(row.location_name)}`,
    }));
  }, [quickFilteredLocations]);

  useEffect(() => {
    if (!selectedAssetKey) return;
    const stillExists = quickFilteredLocations.some((row) => eventAssetKey(row) === selectedAssetKey);
    if (!stillExists) setSelectedAssetKey("");
  }, [quickFilteredLocations, selectedAssetKey]);

  const filteredCurrentLocations = useMemo(() => {
    const search = q.trim().toLowerCase();

    return quickFilteredLocations.filter((row) => {
      if (selectedAssetKey && eventAssetKey(row) !== selectedAssetKey) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (categoryFilter !== "all" && row.asset_category !== categoryFilter) return false;
      if (ownershipFilter !== "all" && row.ownership_type !== ownershipFilter) return false;

      if (search) {
        const haystack = [
          row.asset_label,
          row.asset_category,
          row.ownership_type,
          row.status,
          row.location_name,
          row.address,
          row.postcode,
          row.what3words,
          row.notes,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  }, [
    quickFilteredLocations,
    selectedAssetKey,
    q,
    statusFilter,
    categoryFilter,
    ownershipFilter,
  ]);

  const assetOptions = useMemo(() => {
    const type = assetTypeForCategory(draft.asset_category);

    if (type === "vehicle") return vehicleOptions;
    if (type === "crane") return craneOptions;
    if (type === "equipment") return equipmentOptions;

    return [];
  }, [draft.asset_category, equipmentOptions, vehicleOptions, craneOptions]);

  const counts = useMemo(() => {
    const notInYard = currentLocations.filter((row) => row.status !== "in_yard").length;
    const dropped = currentLocations.filter((row) => row.status === "dropped_on_site").length;
    const inTransit = currentLocations.filter((row) => row.status === "in_transit").length;
    const inYard = currentLocations.filter((row) => row.status === "in_yard").length;
    const overdue = currentLocations.filter(
      (row) => row.status !== "in_yard" && isOverdue(row.collection_due_at)
    ).length;

    return { tracked: currentLocations.length, notInYard, dropped, inTransit, inYard, overdue };
  }, [currentLocations]);

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function changeCategory(category: string) {
    setDraft((current) => ({
      ...current,
      asset_category: category,
      asset_id: "",
      asset_label: "",
    }));
  }

  function setQuickInYard() {
    setDraft((current) => ({
      ...current,
      status: "in_yard",
      location_name: "Swansea yard",
      address: "6 Bay Street, Port Tennant, Swansea",
      postcode: "SA1 8LB",
      collection_due_at: "",
    }));
  }

  function activateQuickFilter(filter: QuickFilter) {
    setQuickFilter(filter);
    setSelectedAssetKey("");
  }

  function duplicateFromCurrent(row: LocationEvent, status?: string) {
    const coords = usableCoordinates(row);

    setDraft({
      asset_category: row.asset_category || "other",
      asset_id: row.asset_id || "",
      asset_label: row.asset_id ? "" : row.asset_label || "",
      ownership_type: row.ownership_type || "owned",
      status: status || row.status || "dropped_on_site",
      location_name: row.location_name || "",
      address: row.address || "",
      postcode: row.postcode || "",
      what3words: row.what3words || "",
      latitude: coords ? String(coords.lat) : "",
      longitude: coords ? String(coords.lng) : "",
      linked_job_id: row.linked_job_id || "",
      linked_transport_job_id: row.linked_transport_job_id || "",
      moved_by_vehicle_id: row.moved_by_vehicle_id || "",
      moved_by_operator_id: row.moved_by_operator_id || "",
      event_time: nowLocalDateTime(),
      collection_due_at:
        status === "in_yard"
          ? ""
          : row.collection_due_at
            ? String(row.collection_due_at).slice(0, 16)
            : "",
      notes: status === "in_yard" ? "Returned to yard." : row.notes || "",
    });

    setMessageType("success");
    setMessage("Asset copied into the update form. Change what is needed and save a new location event.");

    window.setTimeout(() => {
      document.getElementById("asset-location-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!draft.asset_id && !draft.asset_label.trim()) {
      setMessageType("error");
      setMessage("Choose an existing asset or type the asset name manually.");
      return;
    }

    setSaving(true);

    try {
      let latitude = draft.latitude.trim();
      let longitude = draft.longitude.trim();
      let geocoded = false;

      if (!latitude || !longitude) {
        const hasAddressForLookup = [draft.location_name, draft.address, draft.postcode]
          .map((v) => String(v ?? "").trim())
          .filter(Boolean).length > 0;

        if (hasAddressForLookup) {
          try {
            const found = await geocodeLocation({
              location_name: draft.location_name,
              address: draft.address,
              postcode: draft.postcode,
            });

            latitude = found.lat.toFixed(6);
            longitude = found.lng.toFixed(6);
            geocoded = true;
          } catch {
            // Save without a CRM map pin. What3Words/address link still works.
          }
        }
      }

      const res = await fetch("/api/asset-location-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          asset_type: assetTypeForCategory(draft.asset_category),
          asset_id: draft.asset_id || null,
          asset_label: draft.asset_label.trim() || null,
          location_name: draft.location_name.trim() || null,
          address: draft.address.trim() || null,
          postcode: draft.postcode.trim() || null,
          what3words: draft.what3words.trim() || null,
          latitude: latitude || null,
          longitude: longitude || null,
          linked_job_id: draft.linked_job_id || null,
          linked_transport_job_id: draft.linked_transport_job_id || null,
          moved_by_vehicle_id: draft.moved_by_vehicle_id || null,
          moved_by_operator_id: draft.moved_by_operator_id || null,
          event_time: draft.event_time || null,
          collection_due_at: draft.collection_due_at || null,
          notes: draft.notes.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessageType("error");
        setMessage(data?.error || "Could not save asset location.");
        return;
      }

      if (data?.event) {
        setEvents((current) => [data.event as LocationEvent, ...current]);
      }

      setDraft(emptyDraft());
      setMessageType("success");
      setMessage(
        geocoded
          ? "Asset location saved and a map pin was found from the address/postcode."
          : "Asset location saved."
      );
      router.refresh();
    } catch {
      setMessageType("error");
      setMessage("Could not save asset location.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={summaryGridStyle}>
        <SummaryCard
          label="Assets tracked"
          value={String(counts.tracked)}
          active={quickFilter === "all"}
          onClick={() => activateQuickFilter("all")}
        />
        <SummaryCard
          label="Not in yard"
          value={String(counts.notInYard)}
          tone="amber"
          active={quickFilter === "not_in_yard"}
          onClick={() => activateQuickFilter("not_in_yard")}
        />
        <SummaryCard
          label="Dropped on site"
          value={String(counts.dropped)}
          tone="blue"
          active={quickFilter === "dropped_on_site"}
          onClick={() => activateQuickFilter("dropped_on_site")}
        />
        <SummaryCard
          label="In transit"
          value={String(counts.inTransit)}
          tone="purple"
          active={quickFilter === "in_transit"}
          onClick={() => activateQuickFilter("in_transit")}
        />
        <SummaryCard
          label="In yard"
          value={String(counts.inYard)}
          tone="green"
          active={quickFilter === "in_yard"}
          onClick={() => activateQuickFilter("in_yard")}
        />
        <SummaryCard
          label="Overdue collection"
          value={String(counts.overdue)}
          tone="red"
          active={quickFilter === "overdue"}
          onClick={() => activateQuickFilter("overdue")}
        />
      </div>

      <section style={quickSelectorStyle}>
        <div>
          <div style={{ fontWeight: 1000 }}>Quick view: {quickFilterLabel(quickFilter)}</div>
          <div style={smallMutedStyle}>
            Click a card above to filter, then select a specific asset if needed.
          </div>
        </div>

        <select
          value={selectedAssetKey}
          onChange={(e) => setSelectedAssetKey(e.target.value)}
          style={{ ...inputStyle, maxWidth: 520 }}
        >
          <option value="">All assets in this view</option>
          {quickAssetOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Map</h2>
            <p style={mutedTextStyle}>
              Pins show saved coordinates first. If no pin was saved, the CRM tries to estimate a pin from the address/postcode. What3Words-only records open in What3Words.
            </p>
          </div>
        </div>

        <AssetMap
          rows={filteredCurrentLocations}
          onPickLocation={(lat, lng) => {
            updateDraft({ latitude: lat.toFixed(6), longitude: lng.toFixed(6) });
            setMessageType("success");
            setMessage("Map pin selected. Latitude and longitude have been added to the update form.");
          }}
        />
      </section>

      <section id="asset-location-form" style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Update asset location</h2>
            <p style={mutedTextStyle}>
              Keep it simple: pick what it is, who owns it, where it is, and when it needs collecting.
            </p>
          </div>

          <button type="button" onClick={setQuickInYard} style={secondaryBtnStyle}>
            Quick: in yard
          </button>
        </div>

        {message ? (
          <div style={messageType === "success" ? successBoxStyle : errorBoxStyle}>{message}</div>
        ) : null}

        <form onSubmit={submit} style={{ marginTop: 14 }}>
          <div style={formGridStyle}>
            <SelectField
              label="Asset category"
              value={draft.asset_category}
              options={CATEGORY_OPTIONS}
              onChange={changeCategory}
            />

            <SelectField
              label="Existing CRM asset"
              value={draft.asset_id}
              options={assetOptions}
              onChange={(value) =>
                updateDraft({
                  asset_id: value,
                  asset_label: value ? "" : draft.asset_label,
                })
              }
              placeholder={assetOptions.length ? "Manual / not selected" : "No matching CRM list"}
            />

            <TextField
              label="Manual asset name"
              value={draft.asset_label}
              onChange={(value) =>
                updateDraft({
                  asset_label: value,
                  asset_id: value.trim() ? "" : draft.asset_id,
                })
              }
              placeholder="Use if not in CRM list"
            />

            <SelectField
              label="Ownership"
              value={draft.ownership_type}
              options={OWNERSHIP_OPTIONS}
              onChange={(value) => updateDraft({ ownership_type: value })}
            />

            <SelectField
              label="Status"
              value={draft.status}
              options={STATUS_OPTIONS}
              onChange={(value) => updateDraft({ status: value })}
            />

            <TextField
              label="Location / site"
              value={draft.location_name}
              onChange={(value) => updateDraft({ location_name: value })}
              placeholder="e.g. ABC Steel / Yard / Repair depot"
            />

            <TextField
              label="Postcode"
              value={draft.postcode}
              onChange={(value) => updateDraft({ postcode: value })}
              placeholder="e.g. SA1 8LB"
            />

            <TextField
              label="What3Words"
              value={draft.what3words}
              onChange={(value) => updateDraft({ what3words: value.replace(/^\/+/, "") })}
              placeholder="e.g. filled.count.soap"
            />

            <TextField
              label="Latitude"
              value={draft.latitude}
              onChange={(value) => updateDraft({ latitude: value })}
              placeholder="Optional, click map to fill"
              inputMode="decimal"
            />

            <TextField
              label="Longitude"
              value={draft.longitude}
              onChange={(value) => updateDraft({ longitude: value })}
              placeholder="Optional, click map to fill"
              inputMode="decimal"
            />

            <SelectField
              label="Linked crane job"
              value={draft.linked_job_id}
              options={jobOptions}
              onChange={(value) => updateDraft({ linked_job_id: value })}
              placeholder="None"
            />

            <SelectField
              label="Linked transport job"
              value={draft.linked_transport_job_id}
              options={transportJobOptions}
              onChange={(value) => updateDraft({ linked_transport_job_id: value })}
              placeholder="None"
            />

            <SelectField
              label="Moved by vehicle"
              value={draft.moved_by_vehicle_id}
              options={vehicleOptions}
              onChange={(value) => updateDraft({ moved_by_vehicle_id: value })}
              placeholder="Not set"
            />

            <SelectField
              label="Moved by operator"
              value={draft.moved_by_operator_id}
              options={operatorOptions}
              onChange={(value) => updateDraft({ moved_by_operator_id: value })}
              placeholder="Not set"
            />

            <TextField
              label="Event date/time"
              value={draft.event_time}
              onChange={(value) => updateDraft({ event_time: value })}
              type="datetime-local"
            />

            <TextField
              label="Collection due"
              value={draft.collection_due_at}
              onChange={(value) => updateDraft({ collection_due_at: value })}
              type="datetime-local"
            />

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldWrapStyle}>
                <span style={labelStyle}>Address / notes for finding it</span>
                <input
                  value={draft.address}
                  onChange={(e) => updateDraft({ address: e.target.value })}
                  placeholder="e.g. left inside gate by loading bay"
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldWrapStyle}>
                <span style={labelStyle}>Office notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(e) => updateDraft({ notes: e.target.value })}
                  rows={3}
                  placeholder="Anything staff need to know"
                  style={textareaStyle}
                />
              </label>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={saving} style={primaryBtnStyle}>
              {saving ? "Saving..." : "Save location update"}
            </button>

            <button type="button" onClick={() => setDraft(emptyDraft())} style={secondaryBtnStyle}>
              Clear form
            </button>
          </div>
        </form>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Current asset locations</h2>
            <p style={mutedTextStyle}>One row per asset, based on the latest saved location update.</p>
          </div>
        </div>

        <div style={filtersGridStyle}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search asset, location, postcode, notes..."
            style={inputStyle}
          />

          <FilterSelect
            value={statusFilter}
            options={[{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS]}
            onChange={setStatusFilter}
          />

          <FilterSelect
            value={categoryFilter}
            options={[{ value: "all", label: "All categories" }, ...CATEGORY_OPTIONS]}
            onChange={setCategoryFilter}
          />

          <FilterSelect
            value={ownershipFilter}
            options={[{ value: "all", label: "All ownership" }, ...OWNERSHIP_OPTIONS]}
            onChange={setOwnershipFilter}
          />
        </div>

        {filteredCurrentLocations.length === 0 ? (
          <div style={emptyBoxStyle}>No current locations match this view.</div>
        ) : (
          <div style={{ marginTop: 14, overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th align="left" style={thStyle}>Asset</th>
                  <th align="left" style={thStyle}>Ownership</th>
                  <th align="left" style={thStyle}>Status</th>
                  <th align="left" style={thStyle}>Location</th>
                  <th align="left" style={thStyle}>Collection</th>
                  <th align="left" style={thStyle}>Links</th>
                  <th align="left" style={thStyle}>Updated</th>
                  <th align="left" style={thStyle}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredCurrentLocations.map((row) => {
                  const w3wLink = w3wHref(row.what3words);
                  const mapLink = mapsHref(row);

                  return (
                    <tr key={row.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 1000 }}>{safeText(row.asset_label)}</div>
                        <div style={smallMutedStyle}>{categoryLabel(row.asset_category)}</div>
                      </td>

                      <td style={tdStyle}>
                        <span style={{ ...pillStyle, ...ownershipBadgeStyle(row.ownership_type) }}>
                          {ownershipLabel(row.ownership_type)}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <span style={{ ...pillStyle, ...statusBadgeStyle(row.status) }}>
                          {statusLabel(row.status)}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ fontWeight: 850 }}>{safeText(row.location_name)}</div>
                        <div style={smallMutedStyle}>{safeText(row.address)}</div>
                        <div style={smallMutedStyle}>{safeText(row.postcode)}</div>

                        {w3wLink ? (
                          <a href={w3wLink} target="_blank" rel="noreferrer" style={inlineLinkStyle}>
                            ///{row.what3words}
                          </a>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={
                            isOverdue(row.collection_due_at) && row.status !== "in_yard"
                              ? overdueTextStyle
                              : undefined
                          }
                        >
                          {fmtDateTime(row.collection_due_at)}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={smallMutedStyle}>{row.linked_job_id ? "Crane job linked" : "—"}</div>
                        <div style={smallMutedStyle}>
                          {row.linked_transport_job_id ? "Transport job linked" : "—"}
                        </div>

                        {mapLink ? (
                          <a href={mapLink} target="_blank" rel="noreferrer" style={inlineLinkStyle}>
                            Open location
                          </a>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        <div>{fmtDateTime(row.event_time || row.created_at)}</div>
                        <div style={smallMutedStyle}>
                          {row.created_by_username ? `By ${row.created_by_username}` : "—"}
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => duplicateFromCurrent(row)} style={tinyBtnStyle}>
                            Update
                          </button>

                          <button
                            type="button"
                            onClick={() => duplicateFromCurrent(row, "in_yard")}
                            style={tinyBtnStyle}
                          >
                            In yard
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Recent movement history</h2>
            <p style={mutedTextStyle}>Every update is kept as a history record. Nothing is overwritten.</p>
          </div>
        </div>

        {events.length === 0 ? (
          <div style={emptyBoxStyle}>No history yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {events.slice(0, 60).map((row) => (
              <div key={row.id} style={historyCardStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 1000 }}>{safeText(row.asset_label)}</div>

                  <div style={smallMutedStyle}>
                    {categoryLabel(row.asset_category)} • {ownershipLabel(row.ownership_type)} •{" "}
                    {statusLabel(row.status)} • {fmtDateTime(row.event_time || row.created_at)}
                  </div>

                  <div style={smallMutedStyle}>
                    {[row.location_name, row.postcode, row.notes].filter(Boolean).join(" • ") || "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "green" | "blue" | "amber" | "purple" | "red";
  active?: boolean;
  onClick: () => void;
}) {
  const border =
    tone === "green"
      ? "rgba(0,180,120,0.22)"
      : tone === "blue"
        ? "rgba(0,120,255,0.22)"
        : tone === "purple"
          ? "rgba(130,80,255,0.22)"
          : tone === "red"
            ? "rgba(255,0,0,0.22)"
            : tone === "amber"
              ? "rgba(255,170,0,0.26)"
              : "rgba(0,0,0,0.08)";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...summaryCardStyle,
        border: active ? "2px solid #111" : `1px solid ${border}`,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </button>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Select",
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={fieldWrapStyle}>
      <span style={labelStyle}>{label}</span>

      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">— {placeholder} —</option>

        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label style={fieldWrapStyle}>
      <span style={labelStyle}>{label}</span>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        style={inputStyle}
      />
    </label>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const quickSelectorStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.38)",
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.45)",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
};

const mutedTextStyle: React.CSSProperties = {
  marginTop: 6,
  marginBottom: 0,
  opacity: 0.76,
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const summaryCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(255,255,255,0.62)",
  appearance: "none",
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.68,
};

const summaryValueStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 24,
  fontWeight: 1000,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 12,
};

const filtersGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(240px, 1.4fr) repeat(3, minmax(170px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const fieldWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.74,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  resize: "vertical",
};

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.12)",
  cursor: "pointer",
};

const tinyBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "7px 10px",
  borderRadius: 9,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.12)",
  cursor: "pointer",
};

const successBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.22)",
  fontWeight: 800,
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.20)",
  fontWeight: 800,
};

const mapWrapStyle: React.CSSProperties = {
  marginTop: 14,
  overflow: "hidden",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.52)",
};

const mapStyle: React.CSSProperties = {
  width: "100%",
  height: 390,
};

const mapHintStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.72,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.78,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const greenBadge: React.CSSProperties = {
  background: "rgba(0,180,120,0.12)",
  color: "#0b7a4b",
  border: "1px solid rgba(0,180,120,0.22)",
};

const blueBadge: React.CSSProperties = {
  background: "rgba(0,120,255,0.10)",
  color: "#0b57d0",
  border: "1px solid rgba(0,120,255,0.22)",
};

const amberBadge: React.CSSProperties = {
  background: "rgba(255,170,0,0.14)",
  color: "#8a5200",
  border: "1px solid rgba(255,170,0,0.24)",
};

const purpleBadge: React.CSSProperties = {
  background: "rgba(130,80,255,0.11)",
  color: "#4f2bbd",
  border: "1px solid rgba(130,80,255,0.20)",
};

const greyBadge: React.CSSProperties = {
  background: "rgba(120,120,120,0.12)",
  color: "#555",
  border: "1px solid rgba(120,120,120,0.18)",
};

const emptyBoxStyle: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.52)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
};

const smallMutedStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  opacity: 0.68,
};

const inlineLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 4,
  color: "#0b57d0",
  fontWeight: 850,
};

const overdueTextStyle: React.CSSProperties = {
  color: "#b00020",
  fontWeight: 1000,
};

const historyCardStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.54)",
  border: "1px solid rgba(0,0,0,0.08)",
};
