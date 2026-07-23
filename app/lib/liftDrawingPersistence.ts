import { createDefaultLiftDrawing } from "../components/lift-drawing/defaults";
import type { LiftDrawingModelV1, LiftMachineType } from "../components/lift-drawing/types";

export const LIFT_DRAWING_SECTION_KEY = "lift_drawing_model_json";

export function parseLiftDrawingModel(
  value: unknown,
  fallback?: { machineType?: LiftMachineType; machineLabel?: string; drawingNumber?: string },
): LiftDrawingModelV1 {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && Number((parsed as any).version) === 1) {
      return parsed as LiftDrawingModelV1;
    }
  } catch {
    // Invalid legacy/draft JSON is replaced with a safe draft model.
  }
  return createDefaultLiftDrawing(fallback);
}

export function serialiseLiftDrawingModel(model: LiftDrawingModelV1) {
  return JSON.stringify(model);
}
