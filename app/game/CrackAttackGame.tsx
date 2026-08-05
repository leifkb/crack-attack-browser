"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { gameAssetUrl } from "./assetUrl";
import {
  CrackAttackEngine,
  type GameEvent,
  type GameSnapshot,
} from "./engine";
import {
  DEFAULT_SCORE_TO_BEAT,
  loadScoreToBeat,
  recordScoreToBeat,
} from "./highScore";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasPointToBoard,
  drawGame,
  loadBlockMesh,
  prepareSparkleTextures,
  type RenderAssets,
} from "./renderer";

const ASSET_LOAD_TIMEOUT_MS = 8000;

const IMAGE_SOURCES = {
  logo: gameAssetUrl("logo.png"),
  garbage: Array.from(
    { length: 6 },
    (_, index) => gameAssetUrl(
      `garbage_flavor_${index.toString().padStart(3, "0")}.png`,
    ),
  ),
  font: gameAssetUrl("font0_score.png"),
  fontUi: gameAssetUrl("font0_ui.png"),
  messageAnyKey: gameAssetUrl("message_anykey.png"),
  messagePaused: gameAssetUrl("message_paused.png"),
  messageGameOver: gameAssetUrl("message_game_over.png"),
  countdown: {
    "1": gameAssetUrl("count_down_1.png"),
    "2": gameAssetUrl("count_down_2.png"),
    "3": gameAssetUrl("count_down_3.png"),
    "GO!": gameAssetUrl("count_down_go.png"),
  },
  magnitudeSigns: Array.from(
    { length: 9 },
    (_, index) => gameAssetUrl(`sign_${index + 4}.png`),
  ),
  multiplierSigns: Array.from(
    { length: 11 },
    (_, index) => gameAssetUrl(`sign_x${index + 2}.png`),
  ),
} as const;

interface AudioRig {
  context: AudioContext;
  enabled: boolean;
}

function tone(
  rig: AudioRig,
  frequency: number,
  duration: number,
  volume = 0.035,
  offset = 0,
  type: OscillatorType = "sine",
): void {
  if (!rig.enabled || rig.context.state === "closed") return;
  const start = rig.context.currentTime + offset;
  const oscillator = rig.context.createOscillator();
  const gain = rig.context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(rig.context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playEvent(rig: AudioRig | null, event: GameEvent): void {
  if (!rig?.enabled) return;
  if (event.type === "swap") {
    tone(rig, 240, 0.07, 0.02, 0, "square");
    tone(rig, 310, 0.06, 0.018, 0.045, "square");
  } else if (event.type === "clear") {
    const root = event.gray ? 290 : 420;
    const notes = Math.min(6, Math.max(3, event.magnitude));
    for (let index = 0; index < notes; index += 1) {
      tone(rig, root + index * 70, 0.13, 0.026, index * 0.045, "triangle");
    }
  } else if (event.type === "chain") {
    tone(rig, 520 + event.depth * 80, 0.22, 0.04, 0, "sine");
    tone(rig, 780 + event.depth * 100, 0.24, 0.03, 0.09, "triangle");
  } else if (event.type === "garbage-impact") {
    // Sound::play scales the original landing sample by garbage area, capped
    // at ten cells. Keep that relative volume and trigger it on impact—not
    // when the garbage merely enters above the board.
    const impactVolume = Math.min(1, event.area / 10);
    tone(rig, 105, 0.35, 0.055 * impactVolume, 0, "sawtooth");
    tone(rig, 72, 0.42, 0.04 * impactVolume, 0.09, "square");
  } else if (event.type === "awaken") {
    tone(rig, 420 + event.flavor * 58, 0.1, 0.024, 0, "triangle");
    tone(rig, 650 + event.flavor * 52, 0.08, 0.016, 0.035, "sine");
  } else if (event.type === "danger") {
    tone(rig, 165, 0.2, 0.04, 0, "square");
    tone(rig, 165, 0.2, 0.04, 0.28, "square");
  } else if (event.type === "rise") {
    tone(rig, 150, 0.08, 0.016, 0, "triangle");
  } else if (event.type === "start") {
    tone(rig, 440, 0.12, 0.035, 0, "triangle");
    tone(rig, 660, 0.18, 0.035, 0.11, "triangle");
  } else if (event.type === "gameover") {
    [330, 247, 196, 147].forEach((frequency, index) => {
      tone(rig, frequency, 0.25, 0.035, index * 0.15, "sawtooth");
    });
  }
}

function settleWithin<T>(promise: Promise<T>, timeoutMs = ASSET_LOAD_TIMEOUT_MS): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish(null), timeoutMs);
    void promise.then((value) => finish(value), () => finish(null));
  });
}

function loadImage(source: string): Promise<HTMLImageElement | null> {
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => {
      void image.decode()
        .catch(() => undefined)
        .then(() => {
          if (image.naturalWidth > 0) resolve(image);
          else reject(new Error(`Image decoded without dimensions: ${source}`));
        });
    }, { once: true });
    image.addEventListener("error", () => reject(new Error(`Unable to load image: ${source}`)), {
      once: true,
    });
    image.src = source;
  });
  return settleWithin(loading);
}

function waitForFonts(): Promise<void> {
  return document.fonts.ready.then(() => undefined, () => undefined);
}

function browserScoreStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Some privacy modes deny even reading the localStorage property. A run
    // should still start and remain fully playable without persistence.
    return null;
  }
}

function paintCanvas(
  canvas: HTMLCanvasElement | null,
  snapshot: GameSnapshot,
  assets: RenderAssets,
  highScore: number,
): void {
  if (!canvas) return;
  const density = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(CANVAS_WIDTH * density);
  const pixelHeight = Math.round(CANVAS_HEIGHT * density);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(density, 0, 0, density, 0, 0);
  drawGame(context, snapshot, assets, highScore);
}

function statusCopy(snapshot: GameSnapshot): string {
  if (snapshot.status === "ready") return "Ready for a new solo run";
  if (snapshot.status === "countdown") return `Starting in ${snapshot.countdown ?? "a moment"}`;
  if (snapshot.status === "paused") return "Game paused";
  if (snapshot.status === "gameover") return `Game over. Score ${snapshot.score}`;
  if (snapshot.dangerMs > 0) return "Danger: clear the top row before time runs out";
  if (snapshot.awakeningCount > 0) return `${snapshot.awakeningCount} garbage blocks are revealing their colors`;
  if (snapshot.incomingCount > 0) return `${snapshot.incomingCount} garbage attack${snapshot.incomingCount === 1 ? "" : "s"} incoming`;
  return `Score ${snapshot.score}`;
}

export default function CrackAttackGame() {
  const [engine] = useState(() => new CrackAttackEngine({ seed: 0x0caca001 }));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const assetsRef = useRef<RenderAssets>({
    logo: null,
    garbage: [],
    font: null,
    fontUi: null,
    messageAnyKey: null,
    messagePaused: null,
    messageGameOver: null,
    countdown: { "1": null, "2": null, "3": null, "GO!": null },
    magnitudeSigns: [],
    multiplierSigns: [],
    blockMesh: null,
  });
  const audioRef = useRef<AudioRig | null>(null);
  const assetsReadyRef = useRef(false);
  const highScoreRef = useRef(DEFAULT_SCORE_TO_BEAT);
  const lastUiUpdateRef = useRef(0);
  const lastTapRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => engine.getSnapshot(0));
  const lastPublishedRef = useRef({ status: snapshot.status, score: snapshot.score });
  const [isNewBest, setIsNewBest] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [visualReady, setVisualReady] = useState(false);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const AudioConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioConstructor) {
        try {
          audioRef.current = {
            context: new AudioConstructor(),
            enabled: soundEnabled,
          };
        } catch {
          // Audio is optional; browser/device audio limits must not block play.
          audioRef.current = null;
        }
      }
    }
    if (audioRef.current) {
      audioRef.current.enabled = soundEnabled;
      void audioRef.current.context.resume().catch(() => undefined);
    }
  }, [soundEnabled]);

  useEffect(() => {
    highScoreRef.current = loadScoreToBeat(browserScoreStorage());
    let active = true;
    let revealFrame = 0;
    void Promise.all([
      loadImage(IMAGE_SOURCES.logo),
      Promise.all(IMAGE_SOURCES.garbage.map((source) => loadImage(source))),
      loadImage(IMAGE_SOURCES.font),
      loadImage(IMAGE_SOURCES.fontUi),
      loadImage(IMAGE_SOURCES.messageAnyKey),
      loadImage(IMAGE_SOURCES.messagePaused),
      loadImage(IMAGE_SOURCES.messageGameOver),
      loadImage(IMAGE_SOURCES.countdown["1"]),
      loadImage(IMAGE_SOURCES.countdown["2"]),
      loadImage(IMAGE_SOURCES.countdown["3"]),
      loadImage(IMAGE_SOURCES.countdown["GO!"]),
      Promise.all(IMAGE_SOURCES.magnitudeSigns.map((source) => loadImage(source))),
      Promise.all(IMAGE_SOURCES.multiplierSigns.map((source) => loadImage(source))),
      settleWithin(loadBlockMesh(gameAssetUrl("block.obj"))),
      waitForFonts(),
    ]).then(([
      logo,
      garbage,
      font,
      fontUi,
      messageAnyKey,
      messagePaused,
      messageGameOver,
      countdownOne,
      countdownTwo,
      countdownThree,
      countdownGo,
      magnitudeSigns,
      multiplierSigns,
      blockMesh,
    ]) => {
      if (!active) return;
      const assets: RenderAssets = {
        logo,
        garbage,
        font,
        fontUi,
        messageAnyKey,
        messagePaused,
        messageGameOver,
        countdown: {
          "1": countdownOne,
          "2": countdownTwo,
          "3": countdownThree,
          "GO!": countdownGo,
        },
        magnitudeSigns,
        multiplierSigns,
        blockMesh,
      };
      assetsRef.current = assets;
      assetsReadyRef.current = true;
      prepareSparkleTextures();

      // Paint one fully resolved frame before making the game visible. This
      // prevents the Canvas fallbacks from ever reaching the screen while the
      // original logo, bitmap type, and block mesh are still loading.
      const now = performance.now();
      paintCanvas(canvasRef.current, engine.getSnapshot(now), assets, highScoreRef.current);
      revealFrame = window.requestAnimationFrame(() => {
        if (active) setVisualReady(true);
      });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(revealFrame);
    };
  }, [engine]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.enabled = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    let animationFrame = 0;
    const render = (now: number) => {
      engine.update(now);
      const current = engine.getSnapshot(now);
      for (const event of engine.drainEvents()) playEvent(audioRef.current, event);

      if (current.status === "gameover" && current.score > highScoreRef.current) {
        const nextScoreToBeat = recordScoreToBeat(
          browserScoreStorage(),
          highScoreRef.current,
          current.score,
        );
        if (nextScoreToBeat > highScoreRef.current) {
          highScoreRef.current = nextScoreToBeat;
          setIsNewBest(true);
        }
      }

      const canvas = canvasRef.current;
      if (assetsReadyRef.current) {
        paintCanvas(canvas, current, assetsRef.current, highScoreRef.current);
      }

      const lastPublished = lastPublishedRef.current;
      if (now - lastUiUpdateRef.current > 100
        || current.status !== lastPublished.status
        || current.score !== lastPublished.score) {
        lastUiUpdateRef.current = now;
        lastPublishedRef.current = { status: current.status, score: current.score };
        setSnapshot(current);
      }
      animationFrame = window.requestAnimationFrame(render);
    };
    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [engine]);

  const startRun = useCallback(() => {
    ensureAudio();
    const now = performance.now();
    if (engine.getSnapshot(now).status === "gameover") engine.reset(Date.now());
    setIsNewBest(false);
    engine.start(now);
    canvasRef.current?.focus();
    setSnapshot(engine.getSnapshot(now));
  }, [engine, ensureAudio]);

  const restartRun = useCallback(() => {
    ensureAudio();
    engine.reset(Date.now());
    setIsNewBest(false);
    const now = performance.now();
    engine.start(now);
    canvasRef.current?.focus();
    setSnapshot(engine.getSnapshot(now));
  }, [engine, ensureAudio]);

  const pauseRun = useCallback(() => {
    const now = performance.now();
    engine.togglePause(now);
    setSnapshot(engine.getSnapshot(now));
    canvasRef.current?.focus();
  }, [engine]);

  const swap = useCallback(() => {
    ensureAudio();
    engine.swap(performance.now());
    canvasRef.current?.focus();
  }, [engine, ensureAudio]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!assetsReadyRef.current) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      const handled = [
        "arrowleft", "arrowright", "arrowup", "arrowdown",
        "a", "d", "w", "s", " ", "k", "enter", "l", "p",
      ].includes(key);
      if (handled) event.preventDefault();

      const currentStatus = engine.getSnapshot(performance.now()).status;
      if ((currentStatus === "ready" || currentStatus === "gameover") && (key === " " || key === "enter")) {
        if (!event.repeat) startRun();
        return;
      }
      const now = performance.now();
      if (key === "arrowleft" || key === "a") engine.moveCursor(-1, 0, now);
      else if (key === "arrowright" || key === "d") engine.moveCursor(1, 0, now);
      else if (key === "arrowup" || key === "w") engine.moveCursor(0, 1, now);
      else if (key === "arrowdown" || key === "s") engine.moveCursor(0, -1, now);
      else if ((key === " " || key === "k") && !event.repeat) swap();
      else if (key === "enter" || key === "l") engine.setRaiseHeld(true);
      else if (key === "p" && !event.repeat) pauseRun();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "enter" || key === "l") engine.setRaiseHeld(false);
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [engine, pauseRun, startRun, swap]);

  useEffect(() => {
    const onVisibility = () => {
      const now = performance.now();
      const status = engine.getSnapshot(now).status;
      if (document.hidden && (status === "playing" || status === "countdown")) {
        engine.togglePause(now);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [engine]);

  const handleCanvasPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    ensureAudio();
    const rect = event.currentTarget.getBoundingClientRect();
    const canvasX = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const canvasY = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    const current = engine.getSnapshot(performance.now());
    const point = canvasPointToBoard(
      canvasX,
      canvasY,
      current.rise + current.impactOffsetRows,
    );
    if (!point) return;
    const cursorX = Math.min(4, point.x);
    const now = performance.now();
    const previous = lastTapRef.current;
    if (previous && previous.x === cursorX && previous.y === point.y && now - previous.at < 650) {
      engine.setCursor(cursorX, point.y, now);
      engine.swap(now);
      lastTapRef.current = null;
    } else {
      engine.setCursor(cursorX, point.y, now);
      lastTapRef.current = { x: cursorX, y: point.y, at: now };
    }
    event.currentTarget.focus();
  };

  const move = (dx: number, dy: number) => {
    ensureAudio();
    engine.moveCursor(dx, dy, performance.now());
    canvasRef.current?.focus();
  };

  const pressRaise = () => {
    ensureAudio();
    engine.setRaiseHeld(true);
    canvasRef.current?.focus();
  };

  const releaseRaise = () => engine.setRaiseHeld(false);

  return (
    <section
      className="game-experience"
      aria-labelledby="game-title"
      aria-busy={!visualReady}
      style={{ visibility: visualReady ? "visible" : "hidden" }}
    >
      <h1 id="game-title" className="sr-only">Crack Attack browser port</h1>

      <div className="port-bar">
        <div>
          <span className="port-kicker">Open-source browser port</span>
          <span className="port-status"><i aria-hidden="true" /> Original-style single player</span>
        </div>
        <div className="port-actions">
          <button type="button" onClick={() => setSoundEnabled((enabled) => !enabled)}>
            {soundEnabled ? "Sound on" : "Sound off"}
          </button>
          <button type="button" onClick={pauseRun} disabled={snapshot.status === "ready" || snapshot.status === "gameover"}>
            {snapshot.status === "paused" ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      <div className="game-frame">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          onPointerDown={handleCanvasPointer}
          tabIndex={0}
          role="img"
          aria-label="A six-column Crack Attack puzzle board. Use arrow keys to move the two-cell cursor and Space to swap blocks."
        />

        {snapshot.status === "ready" && (
          <div className="game-overlay">
            <button type="button" className="original-screen-action" onClick={startRun}>
              <span className="sr-only">Start single-player game</span>
            </button>
          </div>
        )}

        {snapshot.status === "paused" && (
          <div className="game-overlay">
            <button type="button" className="original-screen-action" onClick={pauseRun}>
              <span className="sr-only">Resume game</span>
            </button>
          </div>
        )}

        {snapshot.status === "gameover" && (
          <div className="game-overlay">
            <button type="button" className="original-screen-action" onClick={restartRun}>
              <span className="sr-only">
                {isNewBest ? "New best score. " : ""}Start a new game after scoring {snapshot.score}
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="touch-console" aria-label="On-screen game controls">
        <div className="direction-pad">
          <button type="button" className="up" aria-label="Move cursor up" onClick={() => move(0, 1)}>▲</button>
          <button type="button" className="left" aria-label="Move cursor left" onClick={() => move(-1, 0)}>◀</button>
          <button type="button" className="down" aria-label="Move cursor down" onClick={() => move(0, -1)}>▼</button>
          <button type="button" className="right" aria-label="Move cursor right" onClick={() => move(1, 0)}>▶</button>
        </div>
        <button type="button" className="console-button swap-button" onClick={swap}>
          <span>Swap</span>
          <kbd>Space</kbd>
        </button>
        <button
          type="button"
          className="console-button raise-button"
          onPointerDown={pressRaise}
          onPointerUp={releaseRaise}
          onPointerCancel={releaseRaise}
          onPointerLeave={releaseRaise}
        >
          <span>Raise</span>
          <kbd>Enter</kbd>
        </button>
      </div>

      <p className="sr-only" aria-live="polite">{statusCopy(snapshot)}</p>
    </section>
  );
}
