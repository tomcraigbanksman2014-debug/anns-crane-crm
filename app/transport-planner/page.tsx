"use client";

import { useEffect, useMemo, useState } from "react";
import ClientShell from "../ClientShell";

type Job = {
  id: string;
  transport_number?: string;
  transport_date?: string;
  collection_time?: string;
  delivery_time?: string;
  status?: string;
  vehicle_id?: string | null;
  operator_id?: string | null;
  collection_lat?: number | null;
  collection_lng?: number | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  clients?: any;
  vehicles?: any;
  operators?: any;
};

function hasCoords(job: Job) {
  return job.collection_lat && job.delivery_lat;
}

function toMinutes(t?: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(a: Job, b: Job) {
  const a1 = toMinutes(a.collection_time);
  const a2 = toMinutes(a.delivery_time);
  const b1 = toMinutes(b.collection_time);
  const b2 = toMinutes(b.delivery_time);

  if (a1 == null || a2 == null || b1 == null || b2 == null) return false;
  return a1 < b2 && b1 < a2;
}

export default function Planner() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/transport-planner/board");
    const json = await res.json();
    setJobs(json.jobs || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateJob(id: string, update: any) {
    // 🧠 AUTO STATUS LOGIC
    if (
      update.vehicle_id &&
      update.operator_id &&
      update.collection_time &&
      update.delivery_time
    ) {
      update.status = "confirmed";
    }

    await fetch("/api/transport-planner/board/update", {
      method: "POST",
      body: JSON.stringify({ transport_job_id: id, ...update }),
    });

    await load();
  }

  function getWarnings(job: Job) {
    const warnings: string[] = [];

    if (!job.vehicle_id) warnings.push("No vehicle");
    if (!job.operator_id) warnings.push("No driver");
    if (!hasCoords(job)) warnings.push("No route");

    const sameDayJobs = jobs.filter(
      (j) =>
        j.id !== job.id &&
        j.transport_date === job.transport_date
    );

    // 🔴 VEHICLE CONFLICT
    if (job.vehicle_id) {
      const clash = sameDayJobs.find(
        (j) =>
          j.vehicle_id === job.vehicle_id &&
          overlaps(j, job)
      );
      if (clash) warnings.push("Vehicle conflict");
    }

    // 🔴 DRIVER CONFLICT
    if (job.operator_id) {
      const clash = sameDayJobs.find(
        (j) =>
          j.operator_id === job.operator_id &&
          overlaps(j, job)
      );
      if (clash) warnings.push("Driver conflict");
    }

    return warnings;
  }

  function statusColor(status?: string) {
    switch (status) {
      case "confirmed":
        return "#ffeaa7";
      case "in_progress":
        return "#74b9ff";
      case "completed":
        return "#55efc4";
      case "cancelled":
        return "#fab1a0";
      default:
        return "#dfe6e9";
    }
  }

  if (loading) return <ClientShell>Loading...</ClientShell>;

  return (
    <ClientShell>
      <div style={{ padding: 20 }}>
        <h1>Transport Planner</h1>

        <div style={{ display: "grid", gap: 12 }}>
          {jobs.map((job) => {
            const warnings = getWarnings(job);

            return (
              <div
                key={job.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: statusColor(job.status),
                  border: "1px solid rgba(0,0,0,0.1)",
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {job.transport_number}
                </div>

                <div style={{ fontSize: 12 }}>
                  {job.collection_time} → {job.delivery_time}
                </div>

                {/* 🚨 WARNINGS */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {warnings.map((w) => (
                    <span
                      key={w}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 6,
                        background:
                          w.includes("conflict")
                            ? "#ff7675"
                            : "#fdcb6e",
                        color: "#000",
                        fontWeight: 700,
                      }}
                    >
                      {w}
                    </span>
                  ))}
                </div>

                {/* ⚡ QUICK ACTIONS */}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() =>
                      updateJob(job.id, { status: "in_progress" })
                    }
                    style={btn}
                  >
                    Start
                  </button>

                  <button
                    onClick={() =>
                      updateJob(job.id, { status: "completed" })
                    }
                    style={btn}
                  >
                    Complete
                  </button>

                  <button
                    onClick={() =>
                      updateJob(job.id, { vehicle_id: null })
                    }
                    style={btn}
                  >
                    Unassign
                  </button>

                  <a href={`/transport-jobs/${job.id}`} style={btn}>
                    Open
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ClientShell>
  );
}

const btn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "#111",
  color: "#fff",
  fontSize: 12,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};
