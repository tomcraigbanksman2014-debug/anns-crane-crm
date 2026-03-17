"use client";

import { useState } from "react";
import TransportQuickEditPanel from "@/components/TransportQuickEditPanel";

export default function PlannerClient({ jobs, vehicles, operators }: any) {
  const [selected, setSelected] = useState<any>(null);

  return (
    <>
      <div>
        {jobs.map((job: any) => (
          <div
            key={job.id}
            onClick={() => setSelected(job)}
            style={{
              padding: 10,
              background: "#fff",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            {job.transport_number}
          </div>
        ))}
      </div>

      {selected && (
        <TransportQuickEditPanel
          job={selected}
          vehicles={vehicles}
          operators={operators}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
