import type { LiftDrawingModelV1, LiftPoint } from "./types";

export function roundTo(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function distanceM(a: { xM: number; yM: number }, b: { xM: number; yM: number }) {
  return Math.hypot(b.xM - a.xM, b.yM - a.yM);
}

export function machineCentreOfRotation(model: LiftDrawingModelV1) {
  const angle = (model.machine.rotationDeg * Math.PI) / 180;
  return {
    xM: model.machine.xM + model.machine.centreOfRotationOffsetM * Math.cos(angle),
    yM: model.machine.yM + model.machine.centreOfRotationOffsetM * Math.sin(angle),
  };
}

export function pointAngleDeg(origin: { xM: number; yM: number }, point: { xM: number; yM: number }) {
  return ((Math.atan2(point.yM - origin.yM, point.xM - origin.xM) * 180) / Math.PI + 360) % 360;
}

export function angleWithinSector(angleDeg: number, startDeg: number, endDeg: number) {
  const angle = ((angleDeg % 360) + 360) % 360;
  const start = ((startDeg % 360) + 360) % 360;
  const end = ((endDeg % 360) + 360) % 360;
  return start <= end ? angle >= start && angle <= end : angle >= start || angle <= end;
}

export function liftRadii(model: LiftDrawingModelV1) {
  const centre = machineCentreOfRotation(model);
  const points = [model.lift.pick, ...model.lift.travelPath, model.lift.landing];
  const radii = points.map((point) => distanceM(centre, point));
  return {
    pickRadiusM: roundTo(distanceM(centre, model.lift.pick)),
    landingRadiusM: roundTo(distanceM(centre, model.lift.landing)),
    maximumRadiusM: roundTo(Math.max(...radii)),
  };
}

export function boomTipGeometry(model: LiftDrawingModelV1) {
  const angle = (model.lift.boomAngleDeg * Math.PI) / 180;
  return {
    radiusM: roundTo(model.lift.boomLengthM * Math.cos(angle)),
    heightM: roundTo(model.lift.boomLengthM * Math.sin(angle)),
  };
}

export function nearestOverheadClearanceM(model: LiftDrawingModelV1) {
  const services = model.objects.filter((item) => item.type === "overhead-service");
  if (!services.length) return null;
  return roundTo(Math.min(...services.map((item) => item.heightM - model.lift.hookHeightM)));
}

export function allLiftPoints(model: LiftDrawingModelV1): LiftPoint[] {
  return [
    model.lift.pick,
    ...model.lift.travelPath.map((point) => ({ ...point, levelM: 0 })),
    model.lift.landing,
  ];
}

export function clampToSite(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}
