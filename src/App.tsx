import { useEffect, useMemo, useState } from "react";
import MapView from "./components/MapView";
import landmarksData from "./data/landmarks.json";
import { runAppTask } from "./apps/registry";
import {
  createGeoWatcher,
  type GeoEvent,
  type GeoFix,
  type GeoStatus
} from "./services/geolocation";
import type { Landmark } from "./types/landmark";
import type { TaskHint } from "./types/task";

const LANDMARKS = landmarksData as Landmark[];

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
  const debugAllowed = import.meta.env.VITE_DEBUG_GPS === "true";
  const watcher = useMemo(() => createGeoWatcher(), []);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [follow, setFollow] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [manualLat, setManualLat] = useState("37.7749");
  const [manualLng, setManualLng] = useState("-122.4194");
  const [manualAccuracy, setManualAccuracy] = useState("10");
  const [counter, setCounter] = useState(0);
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(() => new Set());
  const [openedTaskIndex, setOpenedTaskIndex] = useState<number | null>(null);
  const [revealedHints, setRevealedHints] = useState<Set<number>>(() => new Set([0]));
  const [pastHintsOpen, setPastHintsOpen] = useState(false);
  const [selectedHintIndex, setSelectedHintIndex] = useState<number | null>(null);
  const [taskMessage, setTaskMessage] = useState("");

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
    if (!(debugAllowed && debugMode)) {
      watcher.start();
    }

    return () => {
      unsubscribe();
      watcher.stop();
    };
  }, [watcher, debugMode, debugAllowed]);

  const handleRetry = () => {
    watcher.stop();
    watcher.start();
  };

  const handleApplyManual = () => {
    const lat = Number.parseFloat(manualLat);
    const lng = Number.parseFloat(manualLng);
    const accuracy = Math.max(0, Number.parseFloat(manualAccuracy));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setFix({
        lat,
        lng,
        accuracy: Number.isFinite(accuracy) ? accuracy : 10,
        timestamp: Date.now()
      });
      setStatus("watching");
      setStatusMessage("Debug");
    } else {
      setStatus("error");
      setStatusMessage("Invalid debug coordinates");
    }
  };

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const haversineMeters = (a: GeoFix, b: Landmark) => {
    const earthRadius = 6371000;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  const activeLandmark = counter < LANDMARKS.length ? LANDMARKS[counter] : null;
  const activeDistance =
    fix && activeLandmark ? haversineMeters(fix, activeLandmark) : null;
  const activeInRange =
    activeDistance !== null && activeLandmark
      ? activeDistance <= activeLandmark.radiusMeters
      : false;

  const renderHint = (hint: TaskHint) => {
    if (hint.type === "image") {
      return <img className="hint-image" src={hint.value} alt="Task hint" />;
    }

    return <div className="hint-text">{hint.value}</div>;
  };

  const latText = fix ? fix.lat.toFixed(6) : "--";
  const lngText = fix ? fix.lng.toFixed(6) : "--";
  const accuracyText = fix ? `${Math.round(fix.accuracy)} m` : "--";

  const statusLabel = statusMessage
    ? `${STATUS_LABELS[status]} · ${statusMessage}`
    : STATUS_LABELS[status];

  return (
    <div className="app">
      <MapView
        fix={fix}
        follow={follow}
        status={status}
        debugMode={debugAllowed && debugMode}
        landmarks={LANDMARKS}
      />

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

        <div className="hud-row task-card">
          <div className="task-copy">
            <div className="hud-label">Active task</div>
            <div className="hud-value">
              {activeLandmark ? activeLandmark.task.title : "All tasks complete"}
            </div>
            {activeLandmark && (
              <div className="task-meta">
                {fix && activeDistance !== null
                  ? `${Math.round(activeDistance)}m away`
                  : "Waiting for position..."}
              </div>
            )}
          </div>
          {activeLandmark && revealedHints.has(counter) && (
            <div className="task-hint">{renderHint(activeLandmark.task.hint)}</div>
          )}
          {taskMessage && <div className="task-message">{taskMessage}</div>}
          <div className="hud-row">
            <button
              className="button secondary"
              type="button"
              onClick={() => setPastHintsOpen((prev) => !prev)}
              disabled={completedIndices.size === 0}
            >
              Past hints
            </button>
            {activeLandmark && activeInRange && (
              <>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    runAppTask(activeLandmark.task.app, activeLandmark.task.payload);
                    setOpenedTaskIndex(counter);
                    setTaskMessage(`Opened: ${activeLandmark.task.title}`);
                  }}
                >
                  Open task app
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={openedTaskIndex !== counter}
                  onClick={() => {
                    setCompletedIndices((prev) => {
                      const next = new Set(prev);
                      next.add(counter);
                      return next;
                    });
                    setOpenedTaskIndex(null);
                    const nextIndex = counter + 1;
                    if (nextIndex < LANDMARKS.length) {
                      setCounter(nextIndex);
                      setRevealedHints((prev) => {
                        const next = new Set(prev);
                        next.add(nextIndex);
                        return next;
                      });
                      setTaskMessage(`Hint unlocked: ${LANDMARKS[nextIndex].task.title}`);
                    } else {
                      setCounter(LANDMARKS.length);
                      setTaskMessage("All tasks completed.");
                    }
                  }}
                >
                  Mark resolved
                </button>
              </>
            )}
          </div>
        </div>

        {pastHintsOpen && completedIndices.size > 0 && (
          <div className="past-hints">
            <div className="hud-label">Past hints</div>
            <div className="hint-list">
              {LANDMARKS.slice(0, counter).map((landmark, index) => (
                <button
                  className={`hint-item ${
                    selectedHintIndex === index ? "active" : ""
                  }`}
                  type="button"
                  key={landmark.id}
                  onClick={() => setSelectedHintIndex(index)}
                >
                  {index + 1}. {landmark.task.title}
                </button>
              ))}
            </div>
            {selectedHintIndex !== null &&
              selectedHintIndex < counter &&
              LANDMARKS[selectedHintIndex] && (
                <div className="hint-detail">
                  {renderHint(LANDMARKS[selectedHintIndex].task.hint)}
                </div>
              )}
          </div>
        )}

        {debugAllowed && (
          <div className="hud-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setDebugMode(enabled);
                  if (enabled) {
                    watcher.stop();
                  } else {
                    setStatus("waiting");
                    setStatusMessage("Waiting for GPS");
                    watcher.start();
                  }
                }}
              />
              <span>Debug location</span>
            </label>
          </div>
        )}

        {debugAllowed && debugMode && (
          <div className="hud-row">
            <div className="field">
              <div className="hud-label">Manual Lat</div>
              <input
                className="input"
                value={manualLat}
                onChange={(event) => setManualLat(event.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <div className="hud-label">Manual Lng</div>
              <input
                className="input"
                value={manualLng}
                onChange={(event) => setManualLng(event.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <div className="hud-label">Accuracy (m)</div>
              <input
                className="input"
                value={manualAccuracy}
                onChange={(event) => setManualAccuracy(event.target.value)}
                inputMode="numeric"
              />
            </div>
            <button className="button" type="button" onClick={handleApplyManual}>
              Apply
            </button>
          </div>
        )}

        {debugAllowed && debugMode && (
          <div className="landmark-list">
            <div className="hud-label">Landmarks (within 1km)</div>
            {(() => {
              const maxDistance = 1000;
              const withDistance = fix
                ? LANDMARKS.map((landmark) => ({
                    landmark,
                    distance: haversineMeters(fix, landmark)
                  }))
                : [];
              const nearby = withDistance
                .filter((entry) => entry.distance <= maxDistance)
                .sort((a, b) => a.distance - b.distance);
              const otherCount = LANDMARKS.length - nearby.length;

              if (!fix) {
                return <div className="landmark-item">Waiting for position...</div>;
              }

              return (
                <>
                  {nearby.length === 0 ? (
                    <div className="landmark-item">No nearby landmarks.</div>
                  ) : (
                    nearby.map(({ landmark, distance }) => {
                      const landmarkIndex = LANDMARKS.findIndex(
                        (entry) => entry.id === landmark.id
                      );
                      const isTriggered = completedIndices.has(landmarkIndex);
                      const isActive = landmarkIndex === counter;
                      return (
                        <div
                          key={landmark.id}
                          className={`landmark-item ${isActive ? "active" : ""}`}
                        >
                          <span>{landmark.name}</span>
                          <span className="landmark-meta">
                            {Math.round(distance)}m
                            {isTriggered ? " · triggered" : ""}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div className="landmark-summary">
                    {otherCount} other landmark{otherCount === 1 ? "" : "s"} outside 1km.
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
