"use client";

import { useEffect, useState } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import JobCard from "@/components/planner/JobCard";

export default function PlannerBoard({ jobs, onMoveJob, onAddJob }) {
  const [items, setItems] = useState(jobs || []);

  useEffect(() => {
    setItems(jobs || []);
  }, [jobs]);

  function handleDragEnd(event: any) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);

    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);

    if (onMoveJob) {
      onMoveJob(active.id, newIndex);
    }
  }

  return (
    <div className="p-4">
      {/* ADD JOB BUTTON */}
      <div className="flex justify-end mb-3">
        <button
          onClick={onAddJob}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl"
        >
          + Add Job
        </button>
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
