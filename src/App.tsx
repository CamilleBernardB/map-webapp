import { useEffect, useMemo, useState } from "react";
import MapView from "./components/MapView";
import {
  createGeoWatcher,
  type GeoEvent,
  type GeoFix,
  type GeoStatus
} from "./services/geolocation";

const STATUS_LABELS: Record<GeoStatus, string> = {
  idle: "Idle",
  waiting: "Waiting",
  watching: "GPS OK",
  denied: "Permission denied",
  unavailable: "Unavailable",
  timeout: "Timeout",
  error: "Error"
};

const STATUS_CLASS: Record<GeoStatus, string> = {
  idle: "waiting",
  waiting: "waiting",
  watching: "ok",
  denied: "denied",
  unavailable: "error",
  timeout: "error",
  error: "error"
};

export default function App() {
  const watcher = useMemo(() => createGeoWatcher(), []);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    const handleEvent = (event: GeoEvent) => {
      if (event.type === "fix") {
        setFix(event.fix);
        setStatusMessage("");
      } else {
        setStatus(event.status);
        setStatusMessage(event.message ?? "");
      }
    };

    const unsubscribe = watcher.subscribe(handleEvent);
    watcher.start();

    return () => {
      unsubscribe();
      watcher.stop();
    };
  }, [watcher]);

  const handleRetry = () => {
    watcher.stop();
    watcher.start();
  };

  const latText = fix ? fix.lat.toFixed(6) : "--";
  const lngText = fix ? fix.lng.toFixed(6) : "--";
  const accuracyText = fix ? `${Math.round(fix.accuracy)} m` : "--";

  const statusLabel = statusMessage
    ? `${STATUS_LABELS[status]} · ${statusMessage}`
    : STATUS_LABELS[status];

  return (
    <div className="app">
      <MapView fix={fix} follow={follow} status={status} />

      <div className="hud">
        <div className="hud-row">
          <div>
            <div className="hud-label">Latitude</div>
            <div className="hud-value">{latText}</div>
          </div>
          <div>
            <div className="hud-label">Longitude</div>
            <div className="hud-value">{lngText}</div>
          </div>
          <div>
            <div className="hud-label">Accuracy</div>
            <div className="hud-value">{accuracyText}</div>
          </div>
        </div>

        <div className="hud-row">
          <div className={`status ${STATUS_CLASS[status]}`}>
            <span className="status-dot" />
            {statusLabel}
          </div>

          <div className="hud-row">
            <button
              className={`button ${follow ? "" : "secondary"}`}
              onClick={() => setFollow((prev) => !prev)}
              type="button"
            >
              Follow player: {follow ? "On" : "Off"}
            </button>

            {(status === "denied" ||
              status === "unavailable" ||
              status === "timeout") && (
              <button className="button secondary" onClick={handleRetry} type="button">
                Retry GPS
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
