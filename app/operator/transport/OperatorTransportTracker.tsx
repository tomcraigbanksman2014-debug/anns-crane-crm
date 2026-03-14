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

export default function OperatorTransportTracker({
  operatorId,
  jobs,
}: {
  operatorId: string;
  jobs: TrackJob[];
}) {
  const [activeJobId, setActiveJobId] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [statusText, setStatusText] = useState("Tracking is off.");
  const [lastSentAt, setLastSentAt] = useState("");
  const [coordsText, setCoordsText] = useState("");
  const [errorText, setErrorText] = useState("");

  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? null,
    [jobs, activeJobId]
  );

  useEffect(() => {
    const storedJobId = window.localStorage.getItem("active_transport_job_id") || "";
    if (storedJobId && jobs.some((job) => job.id === storedJobId)) {
      setActiveJobId(storedJobId);
    } else if (jobs[0]?.id) {
      setActiveJobId(jobs[0].id);
    }
  }, [jobs]);

  useEffect(() => {
    if (activeJobId) {
      window.localStorage.setItem("active_transport_job_id", activeJobId);
    }
  }, [activeJobId]);

  async function sendLocation(position: GeolocationPosition) {
    if (!activeJob) return;

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    setCoordsText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setErrorText("");

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

    const now = new Date();
    setLastSentAt(now.toLocaleTimeString("en-GB"));
    setStatusText(`Live tracking active for ${activeJob.transport_number}.`);
  }

  function startTracking() {
    if (!activeJob) {
      setErrorText("Choose a transport job first.");
      return;
    }

    if (!navigator.geolocation) {
      setErrorText("This phone/browser does not support live GPS.");
      return;
    }

    setErrorText("");
    setStatusText("Starting GPS tracking...");

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    lastSentRef.current = 0;

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();

        if (now - lastSentRef.current < 30000) {
          return;
        }

        lastSentRef.current = now;
        await sendLocation(position);
      },
      (error) => {
        setErrorText(error.message || "Could not get GPS location.");
        setIsTracking(false);
        setStatusText("Tracking stopped.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      }
    );

    setIsTracking(true);
  }

  function stopTracking() {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsTracking(false);
    setStatusText("Tracking is off.");
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div style={cardStyle}>
      <h2 style={{ marginTop: 0, fontSize: 22 }}>Live Driver Tracking</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Use this on your phone to send live GPS to the office map and calculate ETA.
      </p>

      <div style={gridStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={labelStyle}>Track this transport job</label>
          <select
            value={activeJobId}
            onChange={(e) => setActiveJobId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— Select —</option>
            {jobs.map((job) => (
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
          <div><strong>Pickup:</strong> {activeJob.collection_address || "—"}</div>
          <div style={{ marginTop: 6 }}><strong>Delivery:</strong> {activeJob.delivery_address || "—"}</div>
          <div style={{ marginTop: 6 }}>
            <strong>Times:</strong> {activeJob.collection_time || "—"} → {activeJob.delivery_time || "—"}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={startTracking} style={primaryBtn}>
          Start tracking
        </button>

        <button type="button" onClick={stopTracking} style={secondaryBtn}>
          Stop tracking
        </button>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        <div style={infoRow}><strong>Status:</strong> {statusText}</div>
        <div style={infoRow}><strong>Current coordinates:</strong> {coordsText || "—"}</div>
        <div style={infoRow}><strong>Last sent:</strong> {lastSentAt || "—"}</div>
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
