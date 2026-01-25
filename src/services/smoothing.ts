import type { GeoFix } from "./geolocation";

export type SmoothPosition = {
  lat: number;
  lng: number;
};

export const SMOOTHING_MS = 300;

export function createSmoother(initial?: GeoFix | null) {
  let current: SmoothPosition | null = initial
    ? { lat: initial.lat, lng: initial.lng }
    : null;
  let target: SmoothPosition | null = initial
    ? { lat: initial.lat, lng: initial.lng }
    : null;
  let lastUpdate = performance.now();

  const setTarget = (fix: GeoFix) => {
    target = { lat: fix.lat, lng: fix.lng };
    if (!current) {
      current = { lat: fix.lat, lng: fix.lng };
    }
  };

  const update = (now: number) => {
    if (!current || !target) {
      lastUpdate = now;
      return current;
    }

    const dt = Math.max(0, now - lastUpdate);
    lastUpdate = now;
    const alpha = Math.min(dt / SMOOTHING_MS, 1);

    // Time-based interpolation keeps motion smooth across uneven GPS updates.
    current = {
      lat: current.lat + (target.lat - current.lat) * alpha,
      lng: current.lng + (target.lng - current.lng) * alpha
    };

    return current;
  };

  return { setTarget, update };
}
