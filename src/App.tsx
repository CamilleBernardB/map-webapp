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
  const [puzzleAnswer, setPuzzleAnswer] = useState("");
  const [wordleInput, setWordleInput] = useState("");
  const [wordleGuesses, setWordleGuesses] = useState<string[]>([]);
  const [wordleMessage, setWordleMessage] = useState("");
  const [fifteenTiles, setFifteenTiles] = useState<number[]>([]);

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
  const isInlineTask = activeLandmark?.task.app === "showMessage";
  const isPuzzleTask = activeLandmark?.task.app === "askPuzzle";
  const isWordleTask = activeLandmark?.task.app === "askWordle";
  const isFifteenTask = activeLandmark?.task.app === "askFifteen";

  useEffect(() => {
    setPuzzleAnswer("");
    setWordleInput("");
    setWordleGuesses([]);
    setWordleMessage("");
    setFifteenTiles([]);
  }, [counter, modalView]);

  const normalizeAnswer = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .join(" ");
  const puzzlePayload =
    isPuzzleTask && activeLandmark && typeof activeLandmark.task.payload === "object"
      ? (activeLandmark.task.payload as { question?: string; answer?: string })
      : null;
  const puzzleQuestion = puzzlePayload?.question ?? "";
  const puzzleAnswerExpected = puzzlePayload?.answer ?? "";
  const puzzleCorrect =
    normalizeAnswer(puzzleAnswer) === normalizeAnswer(puzzleAnswerExpected);

  const wordleAnswer = (() => {
    if (!isWordleTask || !activeLandmark) {
      return "";
    }
    const payload = activeLandmark.task.payload;
    if (typeof payload === "string") {
      return payload;
    }
    if (payload && typeof payload === "object" && "word" in payload) {
      const word = (payload as { word?: string }).word;
      return typeof word === "string" ? word : "";
    }
    return "";
  })();
  const wordleAnswerNormalized = wordleAnswer.trim().toLowerCase();
  const wordleLength = wordleAnswerNormalized.length;
  const wordleSolved = wordleGuesses.some(
    (guess) => guess.toLowerCase() === wordleAnswerNormalized
  );
  const wordleMaxTries = 6;

  const scoreWordle = (guess: string, answer: string) => {
    const result = Array(guess.length).fill("absent");
    const answerChars = answer.split("");
    const used = Array(answer.length).fill(false);
    const guessChars = guess.split("");

    guessChars.forEach((char, index) => {
      if (char === answerChars[index]) {
        result[index] = "correct";
        used[index] = true;
      }
    });

    guessChars.forEach((char, index) => {
      if (result[index] === "correct") {
        return;
      }
      const matchIndex = answerChars.findIndex(
        (answerChar, answerIndex) => !used[answerIndex] && answerChar === char
      );
      if (matchIndex >= 0) {
        result[index] = "present";
        used[matchIndex] = true;
      }
    });

    return result as Array<"correct" | "present" | "absent">;
  };

  const handleWordleSubmit = () => {
    if (!wordleAnswerNormalized) {
      return;
    }
    if (wordleGuesses.length >= wordleMaxTries || wordleSolved) {
      return;
    }
    const guess = wordleInput.trim().toLowerCase();
    if (guess.length !== wordleLength) {
      setWordleMessage(`Enter a ${wordleLength}-letter word.`);
      return;
    }
    setWordleMessage("");
    setWordleGuesses((prev) => [...prev, guess]);
    setWordleInput("");
  };

  const fifteenImageUrl = (() => {
    if (!isFifteenTask || !activeLandmark) {
      return "";
    }
    const payload = activeLandmark.task.payload;
    if (typeof payload === "string") {
      return payload;
    }
    if (payload && typeof payload === "object" && "imageUrl" in payload) {
      const imageUrl = (payload as { imageUrl?: string }).imageUrl;
      return typeof imageUrl === "string" ? imageUrl : "";
    }
    return "";
  })();

  useEffect(() => {
    if (!isFifteenTask || modalView !== "task") {
      return;
    }
    const nextTiles = [...Array(15).keys()].map((value) => value + 1).concat(0);
    const randomMoves = 100;
    const getNeighbors = (emptyIndex: number) => {
      const neighbors: number[] = [];
      const row = Math.floor(emptyIndex / 4);
      const col = emptyIndex % 4;
      if (row > 0) neighbors.push(emptyIndex - 4);
      if (row < 3) neighbors.push(emptyIndex + 4);
      if (col > 0) neighbors.push(emptyIndex - 1);
      if (col < 3) neighbors.push(emptyIndex + 1);
      return neighbors;
    };
    let emptyIndex = nextTiles.indexOf(0);
    for (let i = 0; i < randomMoves; i += 1) {
      const neighbors = getNeighbors(emptyIndex);
      const swapIndex = neighbors[Math.floor(Math.random() * neighbors.length)];
      [nextTiles[emptyIndex], nextTiles[swapIndex]] = [
        nextTiles[swapIndex],
        nextTiles[emptyIndex]
      ];
      emptyIndex = swapIndex;
    }
    setFifteenTiles(nextTiles);
  }, [isFifteenTask, modalView, counter]);

  const isFifteenSolved =
    fifteenTiles.length === 16 &&
    fifteenTiles.every((value, index) =>
      index === 15 ? value === 0 : value === index + 1
    );

  const handleFifteenMove = (index: number) => {
    if (fifteenTiles.length !== 16) {
      return;
    }
    const emptyIndex = fifteenTiles.indexOf(0);
    const row = Math.floor(index / 4);
    const col = index % 4;
    const emptyRow = Math.floor(emptyIndex / 4);
    const emptyCol = emptyIndex % 4;
    const isAdjacent = Math.abs(row - emptyRow) + Math.abs(col - emptyCol) === 1;
    if (!isAdjacent) {
      return;
    }
    const nextTiles = [...fifteenTiles];
    [nextTiles[emptyIndex], nextTiles[index]] = [nextTiles[index], nextTiles[emptyIndex]];
    setFifteenTiles(nextTiles);
  };

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
            if (
              modalView !== "task" ||
              (isPuzzleTask && !puzzleCorrect) ||
              isWordleTask ||
              isFifteenTask
            ) {
              setModalView(null);
            }
          }}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="hud-label">
                {modalView === "task" && isInlineTask && activeLandmark
                  ? activeLandmark.task.title
                  : modalView === "task" && isPuzzleTask && activeLandmark
                  ? activeLandmark.task.title
                  : modalView === "task" && isWordleTask && activeLandmark
                  ? activeLandmark.task.title
                  : modalView === "task" && isFifteenTask && activeLandmark
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
                {isInlineTask ? (
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
                ) : isPuzzleTask ? (
                  <>
                    <div className="modal-title">{activeLandmark.task.title}</div>
                    <div className="task-hint">
                      <div className="hint-text">{puzzleQuestion}</div>
                    </div>
                    <input
                      className="input"
                      value={puzzleAnswer}
                      onChange={(event) => setPuzzleAnswer(event.target.value)}
                      placeholder="Your answer"
                    />
                    {puzzleCorrect && (
                      <div className="task-hint">{renderHint(activeLandmark.task.hint)}</div>
                    )}
                    <button
                      className="button"
                      type="button"
                      disabled={!puzzleCorrect}
                      onClick={() => {
                        resolveCurrentTask();
                        setModalView(null);
                      }}
                    >
                      OK
                    </button>
                  </>
                ) : isWordleTask ? (
                  <>
                    <div className="modal-title">{activeLandmark.task.title}</div>
                    <div className="wordle-grid">
                      {Array.from({ length: wordleMaxTries }).map((_, rowIndex) => {
                        const guess = wordleGuesses[rowIndex] ?? "";
                        const gridLength = Math.max(wordleLength, 1);
                        const letters = guess.padEnd(gridLength, " ").split("");
                        const scores =
                          wordleLength > 0 && guess.length === wordleLength
                            ? scoreWordle(guess, wordleAnswerNormalized)
                            : Array(gridLength).fill("absent");
                        return (
                          <div
                            className="wordle-row"
                            key={`row-${rowIndex}`}
                            style={{ gridTemplateColumns: `repeat(${gridLength}, 1fr)` }}
                          >
                            {letters.map((letter, colIndex) => (
                              <div
                                className={`wordle-tile ${
                                  guess ? scores[colIndex] : ""
                                }`}
                                key={`tile-${rowIndex}-${colIndex}`}
                              >
                                {letter.trim().toUpperCase()}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    <div className="wordle-input">
                      <input
                        className="input"
                        value={wordleInput}
                        onChange={(event) => {
                          const next = event.target.value.replace(/\s+/g, "");
                          setWordleInput(next.slice(0, wordleLength));
                        }}
                        placeholder={`Guess (${wordleLength} letters)`}
                        disabled={
                          wordleLength === 0 ||
                          wordleSolved ||
                          wordleGuesses.length >= wordleMaxTries
                        }
                      />
                      <button
                        className="button secondary"
                        type="button"
                        onClick={handleWordleSubmit}
                        disabled={
                          wordleLength === 0 ||
                          wordleSolved ||
                          wordleGuesses.length >= wordleMaxTries ||
                          wordleInput.trim().length !== wordleLength
                        }
                      >
                        Submit
                      </button>
                    </div>
                    {wordleMessage && <div className="task-message">{wordleMessage}</div>}
                    {wordleSolved && (
                      <div className="task-hint">{renderHint(activeLandmark.task.hint)}</div>
                    )}
                    <button
                      className="button"
                      type="button"
                      disabled={!wordleSolved}
                      onClick={() => {
                        resolveCurrentTask();
                        setModalView(null);
                      }}
                    >
                      OK
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setModalView(null)}
                    >
                      Abandon
                    </button>
                  </>
                ) : isFifteenTask ? (
                  <>
                    <div className="modal-title">{activeLandmark.task.title}</div>
                    <div className="fifteen-grid">
                      {(fifteenTiles.length === 16
                        ? fifteenTiles
                        : [...Array(15).keys()].map((value) => value + 1).concat(0)
                      ).map((value, index) => {
                        const empty = value === 0;
                        const isMovable = (() => {
                          if (empty || fifteenTiles.length !== 16) {
                            return false;
                          }
                          const emptyIndex = fifteenTiles.indexOf(0);
                          const row = Math.floor(index / 4);
                          const col = index % 4;
                          const emptyRow = Math.floor(emptyIndex / 4);
                          const emptyCol = emptyIndex % 4;
                          return Math.abs(row - emptyRow) + Math.abs(col - emptyCol) === 1;
                        })();
                        const tileIndex = value - 1;
                        const row = Math.floor(tileIndex / 4);
                        const col = tileIndex % 4;
                        return (
                          <button
                            key={`tile-${value}-${index}`}
                            type="button"
                            className={`fifteen-tile ${
                              empty ? "empty" : isMovable ? "movable" : ""
                            }`}
                            onClick={() => handleFifteenMove(index)}
                            disabled={empty}
                            style={
                              empty
                                ? undefined
                                : {
                                    backgroundImage: fifteenImageUrl
                                      ? `url(${fifteenImageUrl})`
                                      : "none",
                                    backgroundSize: "400% 400%",
                                    backgroundPosition: `${(col / 3) * 100}% ${
                                      (row / 3) * 100
                                    }%`
                                  }
                            }
                          >
                            {!fifteenImageUrl && value !== 0 ? value : null}
                          </button>
                        );
                      })}
                    </div>
                    {isFifteenSolved && (
                      <div className="task-hint">{renderHint(activeLandmark.task.hint)}</div>
                    )}
                    <button
                      className="button"
                      type="button"
                      disabled={!isFifteenSolved}
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
