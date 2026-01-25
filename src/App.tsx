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
  const [selectedHintIndex, setSelectedHintIndex] = useState<number | null>(null);
  const [taskMessage, setTaskMessage] = useState("");
  const [modalView, setModalView] = useState<"task" | "hints" | "landmarks" | null>(
    null
  );

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

  const resolveCurrentTask = () => {
    if (!activeLandmark) {
      return;
    }

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
  };

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

  const hintIndices = [...revealedHints]
    .filter((index) => completedIndices.has(index))
    .sort((a, b) => a - b);
  const activeHintIndex =
    selectedHintIndex !== null ? selectedHintIndex : hintIndices[0] ?? null;
  const isShowMessage = activeLandmark?.task.app === "showMessage";

  return (
    <div className="app">
      <MapView
        fix={fix}
        follow={follow}
        status={status}
        debugMode={debugAllowed && debugMode}
        landmarks={LANDMARKS}
      />

      <div className="overlay-actions">
        {activeLandmark && activeInRange && !completedIndices.has(counter) && (
          <button
            className="button overlay-button"
            type="button"
            onClick={async () => {
              const result = await runAppTask(
                activeLandmark.task.app,
                activeLandmark.task.payload
              );
              setOpenedTaskIndex(counter);
              setTaskMessage(result.message ?? `Opened: ${activeLandmark.task.title}`);
              setModalView("task");
              if (result.success) {
                resolveCurrentTask();
              }
            }}
          >
            {activeLandmark.task.title}
          </button>
        )}
        <div className="overlay-row">
          <button
            className="button secondary overlay-button past-hints-button"
            type="button"
            onClick={() => setModalView("hints")}
            disabled={revealedHints.size === 0}
          >
            Past hints
          </button>
          {debugAllowed && debugMode && (
            <button
              className="button secondary overlay-button"
              type="button"
              onClick={() => setModalView("landmarks")}
            >
              Landmarks
            </button>
          )}
        </div>
      </div>

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
      </div>

      {modalView && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (modalView !== "task") {
              setModalView(null);
            }
          }}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="hud-label">
                {modalView === "task" && isShowMessage && activeLandmark
                  ? activeLandmark.task.title
                  : modalView === "task"
                  ? "Task"
                  : modalView === "hints"
                  ? "Past hints"
                  : "Landmarks"}
              </div>
            </div>

            {modalView === "task" && activeLandmark && (
              <div className="modal-body">
                {isShowMessage ? (
                  <>
                    <div className="task-hint">{renderHint(activeLandmark.task.hint)}</div>
                    <button
                      className="button"
                      type="button"
                      disabled={openedTaskIndex !== counter}
                      onClick={() => {
                        resolveCurrentTask();
                        setModalView(null);
                      }}
                    >
                      OK
                    </button>
                  </>
                ) : (
                  <>
                    <div className="modal-title">{activeLandmark.task.title}</div>
                    {taskMessage && <div className="task-message">{taskMessage}</div>}
                    <div className="task-hint">{renderHint(activeLandmark.task.hint)}</div>
                    <div className="task-meta">
                      App: {activeLandmark.task.app}
                      {activeDistance !== null ? ` · ${Math.round(activeDistance)}m` : ""}
                    </div>
                    <pre className="task-payload">
                      {JSON.stringify(activeLandmark.task.payload, null, 2)}
                    </pre>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={openedTaskIndex !== counter}
                      onClick={resolveCurrentTask}
                    >
                      Mark resolved
                    </button>
                  </>
                )}
              </div>
            )}

            {modalView === "hints" && (
              <div className="modal-body">
                {hintIndices.length === 0 ? (
                  <div className="task-meta">No hints available yet.</div>
                ) : (
                  <>
                    <div className="hint-list">
                      {hintIndices.map((index) => (
                        <button
                          className={`hint-item ${
                            activeHintIndex === index ? "active" : ""
                          }`}
                          type="button"
                          key={LANDMARKS[index].id}
                          onClick={() => setSelectedHintIndex(index)}
                        >
                          {index + 1}. {LANDMARKS[index].task.title}
                        </button>
                      ))}
                    </div>
                    {activeHintIndex !== null && LANDMARKS[activeHintIndex] && (
                      <div className="hint-detail">
                        {renderHint(LANDMARKS[activeHintIndex].task.hint)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {modalView === "landmarks" && (
              <div className="modal-body">
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
                      return (
                        <div className="landmark-item">Waiting for position...</div>
                      );
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
                          {otherCount} other landmark{otherCount === 1 ? "" : "s"}{" "}
                          outside 1km.
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
