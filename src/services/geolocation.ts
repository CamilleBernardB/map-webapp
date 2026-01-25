export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};

export type GeoStatus =
  | "idle"
  | "waiting"
  | "watching"
  | "denied"
  | "unavailable"
  | "timeout"
  | "error";

export type GeoEvent =
  | { type: "status"; status: GeoStatus; message?: string }
  | { type: "fix"; fix: GeoFix };

export const MAX_ACCURACY_METERS = 50;

export const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10000
};

export type GeoWatcher = {
  start: () => void;
  stop: () => void;
  subscribe: (listener: (event: GeoEvent) => void) => () => void;
};

export function createGeoWatcher(options: PositionOptions = GEO_OPTIONS): GeoWatcher {
  let watchId: number | null = null;
  let active = false;
  const listeners = new Set<(event: GeoEvent) => void>();

  const emit = (event: GeoEvent) => {
    listeners.forEach((listener) => listener(event));
  };

  const stop = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
    active = false;
    emit({ type: "status", status: "idle" });
  };

  const start = () => {
    if (active) {
      return;
    }

    if (!("geolocation" in navigator)) {
      emit({ type: "status", status: "unavailable", message: "Geolocation unavailable" });
      return;
    }

    active = true;
    emit({ type: "status", status: "waiting", message: "Waiting for GPS" });

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const fix: GeoFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };

        // Drop noisy fixes so the marker does not jump erratically.
        if (fix.accuracy > MAX_ACCURACY_METERS) {
          emit({
            type: "status",
            status: "waiting",
            message: `Low accuracy (${Math.round(fix.accuracy)}m)`
          });
          return;
        }

        emit({ type: "fix", fix });
        emit({ type: "status", status: "watching", message: "GPS OK" });
      },
      (error) => {
        let status: GeoStatus = "error";
        let message = error.message;

        if (error.code === error.PERMISSION_DENIED) {
          status = "denied";
          message = "Permission denied";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          status = "unavailable";
          message = "Position unavailable";
        } else if (error.code === error.TIMEOUT) {
          status = "timeout";
          message = "GPS timeout";
        }

        emit({ type: "status", status, message });

        if (status === "denied" || status === "unavailable") {
          stop();
        }
      },
      options
    );
  };

  const subscribe = (listener: (event: GeoEvent) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { start, stop, subscribe };
}
