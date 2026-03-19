"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  transport_number: string;
  status: string;
  transport_date: string;
  collection_time: string;
  delivery_time: string;
  vehicle_id: string | null;
  operator_id: string | null;
  clients?: { company_name: string } | null;
  vehicles?: { name: string } | null;
  operators?: { full_name: string } | null;
};

const ACTIVE_STATUSES = ["planned", "confirmed", "in_progress"];

export default function TransportPlannerBoard() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const res = await fetch("/api/planner/transport");
    const data = await res.json();

    setJobs(data || []);
  }

  function isActive(job: Job) {
    return ACTIVE_STATUSES.includes((job.status || "").toLowerCase());
  }

  function hasConflict(current: Job, all: Job[]) {
    if (!isActive(current)) return false;

    return all.some((job) => {
      if (job.id === current.id) return false;
      if (!isActive(job)) return false;

      const sameVehicle =
        current.vehicle_id &&
        job.vehicle_id &&
        current.vehicle_id === job.vehicle_id;

      const sameDriver =
        current.operator_id &&
        job.operator_id &&
        current.operator_id === job.operator_id;

      if (!sameVehicle && !sameDriver) return false;

      const startA = current.collection_time;
      const endA = current.delivery_time;

      const startB = job.collection_time;
      const endB = job.delivery_time;

      return startA <= endB && endA >= startB;
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12 }}>
      {jobs.map((job) => {
        const conflict = hasConflict(job, jobs);

        return (
          <div
            key={job.id}
            style={{
              padding: 12,
              borderRadius: 12,
              background:
                job.status === "cancelled"
                  ? "rgba(255,0,0,0.08)"
                  : "white",
              border: conflict ? "2px solid red" : "1px solid #ddd",
            }}
          >
            <strong>{job.transport_number}</strong>
            <div>{job.clients?.company_name}</div>
            <div>{job.vehicles?.name}</div>
            <div>{job.operators?.full_name}</div>

            <div>
              {job.collection_time} → {job.delivery_time}
            </div>

            {conflict && (
              <div style={{ color: "red", fontWeight: 700 }}>
                Conflict
              </div>
            )}

            {job.status === "cancelled" && (
              <div style={{ color: "#b00020", fontWeight: 800 }}>
                Cancelled
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
