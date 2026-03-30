"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TrackJob = {
  id: string;
  transport_number: string;
  transport_date: string;
  collection_time: string;
  delivery_date: string;
  delivery_time: string;
  collection_address: string;
  delivery_address: string;
  status: string;
  vehicle_id: string;
  vehicle_label: string;
  collection_route_order?: number | null;
  delivery_route_order?: number | null;
};

type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function applicableRouteOrder(job: TrackJob, selectedDate: string) {
  const orders: number[] = [];

  if (
    job.transport_date === selectedDate &&
    typeof job.collection_route_order === "number" &&
    Number.isFinite(job.collection_route_order)
  ) {
    orders.push(job.collection_route_order);
  }

  const deliveryDate = job.delivery_date || job.transport_date;
  if (
    deliveryDate === selectedDate &&
    typeof job.delivery_route_order === "number" &&
    Number.isFinite(job.delivery_route_order)
  ) {
    orders.push(job.delivery_route_order);
  }

  if (orders.length === 0) return null;
  return Math.min(...orders);
}

function sortJobsForAutoPick(jobs: TrackJob[]) {
  const today = todayIso();

  return [...jobs].sort((a, b) => {
    const aToday = a.transport_date === today ? 0 : 1;
    const bToday = b.transport_date === today ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;

    const aActive =
      a.status === "in_progress" ? 0 : a.status === "confirmed" ? 1 : 2;
    const bActive =
      b.status === "in_progress" ? 0 : b.status === "confirmed" ? 1 : 2;
    if (aActive !== bActive) return aActive - bActive;

    const aRouteOrder = applicableRouteOrder(a, today);
    const bRouteOrder = applicableRouteOrder(b, today);

    if (aRouteOrder !== null && bRouteOrder !== null && aRouteOrder !== bRouteOrder) {
      return aRouteOrder - bRouteOrder;
    }

    if (aRouteOrder !== null && bRouteOrder === null) return -1;
    if (aRouteOrder === null && bRouteOrder !== null) return 1;

    const aTime = String(a.collection_time || "99:99");
    const bTime = String(b.collection_time || "99:99");
    return aTime.localeCompare(bTime);
  });
}

function ageTextFromIso(value: string | null) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "—";

  const diffMs = Date.now() - then;
  const diffSec = Math.max(0, Math.round(diffMs / 1000));

  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function isStale(lastSentIso: string | null, limitMinutes = 3) {
  if (!lastSentIso) return true;
  const then = new Date(lastSentIso).getTime();
  if (!Number.isFinite(then)) return true;
  return Date.now() - then > limitMinutes * 60 * 1000;
}

export default function OperatorTransportTracker({
  operatorId,
  jobs,
}: {
  operatorId: string;
  jobs: TrackJob[];
}) {
  const [activeJobId, setActiveJobId] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [statusText, setStatusText] = useState("Preparing automatic tracking...");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [lastGpsAt, setLastGpsAt] = useState<string | null>(null);
  const [coordsText, setCoordsText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [permissionText, setPermissionText] = useState("Waiting for location permission...");
  const [wakeLockText, setWakeLockText] = useState("Not requested");
  const [visibilityText, setVisibilityText] = useState(
    typeof document !== "undefined" && document.visibilityState === "visible"
      ? "Page visible"
      : "Page not visible"
  );

  const watchIdRef = useRef<number | null>(null);
  const lastSentMsRef = useRef<number>(0);
  const lastGpsMsRef = useRef<number>(0);
  const fallbackIntervalRef = useRef<number | null>(null);
  const staleCheckIntervalRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const autoStartedRef = useRef(false);

  const orderedJobs = useMemo(() => sortJobsForAutoPick(jobs), [jobs]);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? null,
    [jobs, activeJobId]
  );

  const trackingLooksStale = isStale(lastSentAt, 3);

  async function acquireWakeLock() {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: {
          request: (type: "screen") => Promise<WakeLockSentinelLike>;
        };
      };

      if (!nav.wakeLock?.request) {
        setWakeLockText("Wake lock not supported on this device/browser");
        return;
      }

      if (wakeLockRef.current) {
        await wakeLockRef.current.release().catch(() => undefined);
        wakeLockRef.current = null;
      }

      wakeLockRef.current = await nav.wakeLock.request("screen");
      setWakeLockText("Screen wake lock active");
    } catch {
      setWakeLockText("Wake lock unavailable");
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release().catch(() => undefined);
        wakeLockRef.current = null;
      }
      setWakeLockText("Wake lock released");
    } catch {
      setWakeLockText("Wake lock release failed");
    }
  }

  async function sendLocation(position: GeolocationPosition) {
    if (!activeJob) return;

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    setCoordsText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setErrorText("");

    const nowIso = new Date().toISOString();
    lastGpsMsRef.current = Date.now();
    setLastGpsAt(nowIso);

    const res = await fetch("/api/driver-location/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operator_id: operatorId,
        vehicle_id: activeJob.vehicle_id || null,
        transport_job_id: activeJob.id,
        lat,
        lng,
        accuracy: position.coords.accuracy ?? null,
        speed: position.coords.speed ?? null,
        heading: position.coords.heading ?? null,
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      setErrorText(json?.error || "Could not send location.");
      return;
    }

    lastSentMsRef.current = Date.now();
    setLastSentAt(nowIso);
    setStatusText(`Tracking live for ${activeJob.transport_number}.`);
    setPermissionText("Location permission granted.");
  }

  function clearTrackingInternals() {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (fallbackIntervalRef.current !== null) {
      window.clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }

    if (staleCheckIntervalRef.current !== null) {
      window.clearInterval(staleCheckIntervalRef.current);
      staleCheckIntervalRef.current = null;
    }
  }

  async function requestSinglePositionAndSend(reason: string) {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setStatusText(`Tracking live for ${activeJob?.transport_number ?? "selected job"} (${reason}).`);
        await sendLocation(position);
      },
      (error) => {
        setErrorText(error.message || "Could not get GPS location.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      }
    );
  }

  function startFallbackPolling() {
    if (fallbackIntervalRef.current !== null) {
      window.clearInterval(fallbackIntervalRef.current);
    }

    fallbackIntervalRef.current = window.setInterval(async () => {
      if (!activeJob) return;

      const now = Date.now();
      const noGpsForTooLong = now - lastGpsMsRef.current > 45000;
      const noSendForTooLong = now - lastSentMsRef.current > 45000;

      if (document.visibilityState !== "visible") {
        setVisibilityText("Page not visible");
      }

      if (noGpsForTooLong || noSendForTooLong) {
        await requestSinglePositionAndSend("fallback refresh");
      }
    }, 30000);
  }

  function startStaleChecker() {
    if (staleCheckIntervalRef.current !== null) {
      window.clearInterval(staleCheckIntervalRef.current);
    }

    staleCheckIntervalRef.current = window.setInterval(() => {
      if (!lastSentMsRef.current) return;

      const now = Date.now();
      const diff = now - lastSentMsRef.current;

      if (diff > 3 * 60 * 1000) {
        setStatusText("Tracking warning: no fresh location sent in the last 3 minutes.");
      }
    }, 15000);
  }

  async function startTracking() {
    if (!navigator.geolocation) {
      setErrorText("Geolocation is not supported on this device/browser.");
      return;
    }

    if (!activeJob) {
      setErrorText("No active transport job selected.");
      return;
    }

    clearTrackingInternals();
    await acquireWakeLock();

    setErrorText("");
    setPermissionText("Requesting location permission...");
    setStatusText(`Starting tracking for ${activeJob.transport_number}...`);

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        setPermissionText("Location permission granted.");
        await sendLocation(position);
      },
      (error) => {
        setErrorText(error.message || "Could not get GPS location.");
        setPermissionText("Location permission denied or unavailable.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      }
    );

    watchIdRef.current = watchId;
    setIsTracking(true);

    await requestSinglePositionAndSend("initial fix");
    startFallbackPolling();
    startStaleChecker();
  }

  async function stopTracking() {
    clearTrackingInternals();
    await releaseWakeLock();
    setIsTracking(false);
    setStatusText("Tracking paused.");
  }

  useEffect(() => {
    const suggested = orderedJobs[0]?.id ?? "";

    if (!activeJobId && suggested) {
      setActiveJobId(suggested);
    }
  }, [orderedJobs, activeJobId]);

  useEffect(() => {
    async function onVisibilityChange() {
      const visible = document.visibilityState === "visible";
      setVisibilityText(visible ? "Page visible" : "Page not visible");

      if (visible && isTracking) {
        await acquireWakeLock();
        await requestSinglePositionAndSend("page visible refresh");
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isTracking, activeJob]);

  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!orderedJobs.length) return;

    autoStartedRef.current = true;
    startTracking();

    return () => {
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedJobs.length]);

  useEffect(() => {
    return () => {
      clearTrackingInternals();
      releaseWakeLock();
    };
  }, []);

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 22 }}>Automatic Driver Tracking</h3>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Keeps sending your live location while you stay on this page.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={startTracking} style={primaryBtn}>
            Start Tracking
          </button>
          <button type="button" onClick={stopTracking} style={ghostBtn}>
            Stop Tracking
          </button>
        </div>
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>Active transport job</label>
        <select
          value={activeJobId}
          onChange={(e) => setActiveJobId(e.target.value)}
          style={inputStyle}
        >
          <option value="">— Select —</option>
          {orderedJobs.map((job) => {
            const todayOrder = applicableRouteOrder(job, todayIso());
            return (
              <option key={job.id} value={job.id}>
                {todayOrder ? `#${todayOrder} • ` : ""}{job.transport_number} • {job.transport_date} • {job.collection_time || "—"}
              </option>
            );
          })}
        </select>
      </div>

      <div style={statusGrid}>
        <InfoBox label="Tracking" value={isTracking ? "Live" : "Stopped"} />
        <InfoBox label="Selected job" value={activeJob?.transport_number ?? "—"} />
        <InfoBox label="Last sent" value={ageTextFromIso(lastSentAt)} />
        <InfoBox label="Last GPS fix" value={ageTextFromIso(lastGpsAt)} />
        <InfoBox label="Coords" value={coordsText || "—"} />
        <InfoBox label="Permission" value={permissionText} />
        <InfoBox label="Wake lock" value={wakeLockText} />
        <InfoBox label="Visibility" value={visibilityText} />
      </div>

      {trackingLooksStale ? (
        <div style={warnBox}>Tracking warning: no fresh location has been sent recently.</div>
      ) : null}

      {statusText ? <div style={infoBox}>{statusText}</div> : null}
      {errorText ? <div style={errorBox}>{errorText}</div> : null}
    </div>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={miniCard}>
      <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "rgba(255,255,255,0.58)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const fieldWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginTop: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
};

const statusGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const miniCard: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.50)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const infoBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 700,
};

const warnBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,170,0,0.14)",
  border: "1px solid rgba(255,170,0,0.24)",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.24)",
  fontWeight: 800,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
};
