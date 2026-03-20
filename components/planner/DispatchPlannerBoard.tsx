"use client";

import { useState } from "react";

type Equipment = {
  id: string;
  name: string;
  asset_number?: string | null;
  type?: string | null;
  capacity?: string | null;
  status?: string | null;
};

type Job = {
  id: string;
  job_number: string;
  job_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  status?: string | null;
  clients?: {
    id: string;
    company_name: string;
  } | null;
};

interface DispatchPlannerBoardProps {
  equipment: Equipment[];
  jobs: Job[];
}

export default function DispatchPlannerBoard({
  equipment,
  jobs,
}: DispatchPlannerBoardProps) {
  const [assignments, setAssignments] = useState<Record<string, Job | null>>(
    {}
  );

  function handleAssign(equipmentId: string, job: Job) {
    setAssignments((prev) => ({
      ...prev,
      [equipmentId]: job,
    }));
  }

  function handleUnassign(equipmentId: string) {
    setAssignments((prev) => ({
      ...prev,
      [equipmentId]: null,
    }));
  }

  const unassignedJobs = jobs.filter((job) => {
    return !Object.values(assignments).some(
      (assigned) => assigned?.id === job.id
    );
  });

  return (
    <div className="space-y-8">
      {/* UNASSIGNED JOBS */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Unassigned Jobs</h2>

        {unassignedJobs.length === 0 && (
          <p className="text-sm text-gray-500">No unassigned jobs.</p>
        )}

        <div className="grid gap-3">
          {unassignedJobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <div className="font-medium">
                  Job #{job.job_number}
                </div>

                <div className="text-sm text-gray-500">
                  {job.clients?.company_name || "Unknown customer"}
                </div>

                <div className="text-sm text-gray-500">
                  {job.site_name || "Unknown site"}
                </div>
              </div>

              <div className="text-sm text-gray-400">
                {job.start_time || "--:--"} - {job.end_time || "--:--"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* EQUIPMENT ROWS */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Cranes</h2>

        <div className="space-y-4">
          {equipment.map((crane) => {
            const assignedJob = assignments[crane.id];

            return (
              <div
                key={crane.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                {/* Crane Info */}
                <div className="w-1/3">
                  <div className="font-semibold">{crane.name}</div>

                  <div className="text-sm text-gray-500">
                    {crane.asset_number || "No asset number"}
                  </div>

                  <div className="text-sm text-gray-500">
                    {crane.type || "Unknown type"}
                    {crane.capacity ? ` • ${crane.capacity}` : ""}
                  </div>
                </div>

                {/* Assignment */}
                <div className="w-2/3">
                  {!assignedJob && (
                    <div className="flex flex-wrap gap-2">
                      {unassignedJobs.slice(0, 5).map((job) => (
                        <button
                          key={job.id}
                          onClick={() => handleAssign(crane.id, job)}
                          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-100"
                        >
                          Assign Job #{job.job_number}
                        </button>
                      ))}
                    </div>
                  )}

                  {assignedJob && (
                    <div className="flex items-center justify-between rounded-md bg-gray-50 p-3">
                      <div>
                        <div className="font-medium">
                          Job #{assignedJob.job_number}
                        </div>

                        <div className="text-sm text-gray-500">
                          {assignedJob.clients?.company_name ||
                            "Unknown customer"}
                        </div>

                        <div className="text-sm text-gray-500">
                          {assignedJob.site_name || "Unknown site"}
                        </div>
                      </div>

                      <button
                        onClick={() => handleUnassign(crane.id)}
                        className="rounded-md border px-3 py-1 text-sm hover:bg-gray-100"
                      >
                        Unassign
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
