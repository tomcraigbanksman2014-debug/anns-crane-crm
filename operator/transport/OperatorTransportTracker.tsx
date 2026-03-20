"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TrackJob = {
  id: string;
  transport_number: string;
  transport_date: string;
  collection_time: string;
  delivery_time: string;
  collection_address: string;
  delivery_address: string;
  status: string;
  vehicle_id: string;
  vehicle_label: string;
};

type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
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

  function stopTracking() {
    clearTrackingInternals();
    releaseWakeLock();
    setIsTracking(false);
    setStatusText("Tracking stopped.");
  }

  function startTrackingAutomatically() {
    if (!activeJob) {
      setErrorText("No transport job available to track.");
      return;
    }

    if (!navigator.geolocation) {
      setErrorText("This phone/browser does not support live GPS.");
      setPermissionText("Location services unavailable.");
      return;
    }

    clearTrackingInternals();
    lastSentMsRef.current = 0;
    lastGpsMsRef.current = 0;
    setErrorText("");
    setStatusText(`Starting automatic tracking for ${activeJob.transport_number}...`);
    setPermissionText("Requesting location permission...");

    acquireWakeLock();

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        lastGpsMsRef.current = Date.now();
        setLastGpsAt(new Date().toISOString());

        const now = Date.now();
        if (now - lastSentMsRef.current < 20000) {
          return;
        }

        await sendLocation(position);
      },
      (error) => {
        setErrorText(error.message || "Could not get GPS location.");
        setPermissionText("Location permission denied or unavailable.");
        setIsTracking(false);
        setStatusText("Automatic tracking could not start.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      }
    );

    setIsTracking(true);
    startFallbackPolling();
    startStaleChecker();
    requestSinglePositionAndSend("initial fix");
  }

  useEffect(() => {
    const storedJobId =
      typeof window !== "undefined"
        ? window.localStorage.getItem("active_transport_job_id") || ""
        : "";

    if (storedJobId && jobs.some((job) => job.id === storedJobId)) {
      setActiveJobId(storedJobId);
      return;
    }

    if (orderedJobs[0]?.id) {
      setActiveJobId(orderedJobs[0].id);
    }
  }, [jobs, orderedJobs]);

  useEffect(() => {
    if (activeJobId && typeof window !== "undefined") {
      window.localStorage.setItem("active_transport_job_id", activeJobId);
    }
  }, [activeJobId]);

  useEffect(() => {
    async function onVisibilityChange() {
      const visible = document.visibilityState === "visible";
      setVisibilityText(visible ? "Page visible" : "Page not visible");

      if (visible && isTracking) {
        await acquireWakeLock();
        await requestSinglePositionAndSend("page visible again");
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isTracking, activeJob]);

  useEffect(() => {
    if (!activeJob) return;

    if (!autoStartedRef.current) {
      autoStartedRef.current = true;
      startTrackingAutomatically();
      return;
    }

    startTrackingAutomatically();
  }, [activeJobId]);

  useEffect(() => {
    return () => {
      clearTrackingInternals();
      releaseWakeLock();
    };
  }, []);

  return (
    <div style={cardStyle}>
      <div
        style={{
          ...topBannerStyle,
          ...(trackingLooksStale ? staleBannerStyle : healthyBannerStyle),
        }}
      >
        <div style={{ fontWeight: 900 }}>
          {trackingLooksStale
            ? "Tracking warning"
            : isTracking
            ? "Tracking active"
            : "Tracking inactive"}
        </div>
        <div style={{ marginTop: 4, fontSize: 13 }}>
          {trackingLooksStale
            ? "Keep this page open on the phone during the shift. Background browser tracking can pause if the page is hidden."
            : "Best browser-mode tracking is active. Keep this page open during the shift for the most reliable updates."}
        </div>
      </div>

      <h2 style={{ marginTop: 16, fontSize: 22 }}>Live Driver Tracking</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Tracking starts automatically when this page is opened on the driver’s phone.
      </p>

      <div style={gridStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Tracking this transport job</label>
          <select
            value={activeJobId}
            onChange={(e) => setActiveJobId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— Select —</option>
            {orderedJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.transport_number} • {job.transport_date} • {job.vehicle_label || "No vehicle"}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Selected vehicle</label>
          <div style={readBox}>{activeJob?.vehicle_label || "—"}</div>
        </div>
      </div>

      {activeJob ? (
        <div style={jobInfoBox}>
          <div>
            <strong>Pickup:</strong> {activeJob.collection_address || "—"}
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>Delivery:</strong> {activeJob.delivery_address || "—"}
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>Times:</strong> {activeJob.collection_time || "—"} → {activeJob.delivery_time || "—"}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={stopTracking} style={secondaryBtn}>
          Stop tracking
        </button>

        <button
          type="button"
          onClick={startTrackingAutomatically}
          style={primaryBtn}
        >
          Restart tracking
        </button>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        <div style={infoRow}>
          <strong>Status:</strong> {statusText}
        </div>
        <div style={infoRow}>
          <strong>Permission:</strong> {permissionText}
        </div>
        <div style={infoRow}>
          <strong>Wake lock:</strong> {wakeLockText}
        </div>
        <div style={infoRow}>
          <strong>Page state:</strong> {visibilityText}
        </div>
        <div style={infoRow}>
          <strong>Current coordinates:</strong> {coordsText || "—"}
        </div>
        <div style={infoRow}>
          <strong>Last GPS fix:</strong> {ageTextFromIso(lastGpsAt)}
        </div>
        <div style={infoRow}>
          <strong>Last sent to office:</strong> {ageTextFromIso(lastSentAt)}
        </div>
        <div style={infoRow}>
          <strong>Tracking:</strong> {isTracking ? "On" : "Off"}
        </div>
      </div>

      {errorText ? <div style={errorBox}>{errorText}</div> : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const topBannerStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
};

const healthyBannerStyle: React.CSSProperties = {
  background: "rgba(0,180,120,0.10)",
  border: "1px solid rgba(0,180,120,0.18)",
  color: "#0b7a4b",
};

const staleBannerStyle: React.CSSProperties = {
  background: "rgba(255,170,0,0.14)",
  border: "1px solid rgba(255,170,0,0.24)",
  color: "#8a5200",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
};

const readBox: React.CSSProperties = {
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.65)",
  boxSizing: "border-box",
  fontWeight: 700,
};

const jobInfoBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  background: "#111",
  color: "#fff",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  background: "rgba(255,255,255,0.72)",
  color: "#111",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  cursor: "pointer",
  fontWeight: 800,
};

const infoRow: React.CSSProperties = {
  fontSize: 14,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
