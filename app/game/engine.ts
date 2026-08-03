/*
 * Crack Attack! browser port
 * Copyright (C) 2026 OpenAI
 *
 * Gameplay behavior is derived from Crack Attack! 1.1.15-cvs.
 * Crack Attack! is Copyright (C) 2000-2006 by its original contributors.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version.
 */

export const BOARD_COLUMNS = 6;
export const VISIBLE_ROWS = 12;
export const BUFFER_ROWS = 24;
export const NORMAL_FLAVOR_COUNT = 5;
export const GRAY_FLAVOR = 5;
export const AWAKEN_INITIAL_DELAY_MS = 1300;
export const AWAKEN_INTERNAL_DELAY_MS = 300;
export const AWAKEN_FINAL_DELAY_MS = 1000;
export const AWAKEN_POP_DURATION_MS = 240;
export const CURSOR_MOVE_DURATION_MS = 120;
// Crack Attack advances at 50 Hz and keeps dying blocks alive for 90 ticks.
export const BLOCK_CLEAR_DURATION_MS = 90 * 20;
export const DANGER_LOSS_DELAY_MS = 7000;
export const REWARD_SIGN_LIFETIME_MS = 1650;
export const DEATH_SPARK_GRAVITY = 1.8;
export const LEVEL_LIGHT_FADE_MS = 3000;
export const GARBAGE_ROW_REFORM_CHANCE = 0.5;
const SWAP_DURATION_MS = 125;
// Original 50 Hz timing: three ticks hanging, then three ticks per row.
const FALL_HANG_MS = 60;
const FALL_ROW_MS = 60;

export type BlockFlavor = 0 | 1 | 2 | 3 | 4 | 5;
export type GameStatus = "ready" | "countdown" | "playing" | "paused" | "gameover";
export type GarbageFlavor = "normal" | "gray";

interface Motion {
  animationFromX?: number;
  animationFromY?: number;
  animationStarted?: number;
  animationDuration?: number;
  animationDelay?: number;
}

export interface BlockCell extends Motion {
  id: number;
  kind: "block";
  flavor: BlockFlavor;
  state: "idle" | "clearing" | "awakening";
  clearStarted?: number;
  clearUntil?: number;
  deathSparkCount?: number;
  awakenRevealAt?: number;
  awakenReleaseAt?: number;
  awakenSource?: GarbageFlavor;
  awakenSequence?: number;
  awakenNotified?: boolean;
  comboId?: number;
}

export interface GarbageCell extends Motion {
  id: number;
  kind: "garbage";
  groupId: number;
  flavor: GarbageFlavor;
  texture: number;
  state: "idle" | "shattering" | "awakening";
  clearStarted?: number;
  clearUntil?: number;
  shatterTargetFlavor?: BlockFlavor;
  shatterSequence?: number;
  shatterReforms?: boolean;
  awakenRevealAt?: number;
  awakenReleaseAt?: number;
  awakenSource?: GarbageFlavor;
  awakenSequence?: number;
  comboId?: number;
}

export type Cell = BlockCell | GarbageCell;
export type Board = Array<Array<Cell | null>>;

export interface Coordinate {
  x: number;
  y: number;
}

export interface MatchPattern {
  coordinates: Coordinate[];
  anchor: Coordinate;
}

export interface MatchResult {
  coordinates: Coordinate[];
  patterns: MatchPattern[];
}

export interface RewardSign {
  id: number;
  kind: "magnitude" | "multiplier";
  value: number;
  x: number;
  y: number;
  jitterX: number;
  jitterY: number;
  startedAt: number;
  until: number;
}

export type SparkleStyle =
  | "four"
  | "five"
  | "six"
  | "special"
  | "multiplier-one"
  | "multiplier-two"
  | "multiplier-three";

export interface DeathSpark {
  id: number;
  flavor: BlockFlavor;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  angularVelocity: number;
  size: number;
  startedAt: number;
  until: number;
}

export interface RewardMote {
  id: number;
  style: SparkleStyle;
  x: number;
  y: number;
  outward: number;
  rotation: number;
  angularVelocity: number;
  size: number;
  startedAt: number;
  launchAt: number;
  until: number;
}

export interface AttackPayload {
  height: number;
  width: number;
  flavor: GarbageFlavor;
  source: "clear" | "chain";
  createdAt: number;
}

export type AttackSink = (attack: AttackPayload) => void;

interface QueuedAttack extends AttackPayload {
  dropAt: number;
}

export type GameEvent =
  | { type: "swap" }
  | { type: "clear"; magnitude: number; gray: boolean }
  | { type: "chain"; depth: number }
  | { type: "garbage" }
  | { type: "awaken"; flavor: BlockFlavor; sequence: number }
  | { type: "danger" }
  | { type: "rise" }
  | { type: "start" }
  | { type: "gameover" };

export interface GameSnapshot {
  board: Board;
  nextRow: Array<Cell | null>;
  status: GameStatus;
  phase: Phase;
  score: number;
  elapsedMs: number;
  rise: number;
  cursorX: number;
  cursorY: number;
  cursorRenderX: number;
  cursorRenderY: number;
  swapProgress: number;
  chainDepth: number;
  topOccupiedRow: number;
  levelLightBlends: number[];
  dangerMs: number;
  incomingCount: number;
  nextIncomingMs: number | null;
  countdown: string | null;
  countdownProgress: number;
  gameOverElapsedMs: number;
  message: string | null;
  messageUntil: number;
  lastGain: number;
  rewardSigns: RewardSign[];
  deathSparks: DeathSpark[];
  rewardMotes: RewardMote[];
  awakeningCount: number;
  nextAwakeningMs: number | null;
  visualNow: number;
}

type Phase = "idle" | "swapping" | "clearing" | "falling" | "garbage";

interface LevelLightTransition {
  from: number;
  to: number;
  startedAt: number;
  duration: number;
}

interface ComboState {
  id: number;
  createdAt: number;
  multiplier: number;
  baseAccumulatedScore: number;
}

function emptyRow(): Array<Cell | null> {
  return Array.from({ length: BOARD_COLUMNS }, () => null);
}

export function createEmptyBoard(): Board {
  return Array.from({ length: BUFFER_ROWS }, emptyRow);
}

function isMatchable(cell: Cell | null): cell is BlockCell {
  return cell?.kind === "block" && cell.state === "idle";
}

function coordinateKey(x: number, y: number): string {
  return `${x}:${y}`;
}

export function findMatches(board: Board): MatchResult {
  const lines: Coordinate[][] = [];

  for (let y = 0; y < board.length; y += 1) {
    let x = 0;
    while (x < BOARD_COLUMNS) {
      const cell = board[y]?.[x] ?? null;
      if (!isMatchable(cell)) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (
        end < BOARD_COLUMNS &&
        isMatchable(board[y][end]) &&
        (board[y][end] as BlockCell).flavor === cell.flavor
      ) {
        end += 1;
      }
      if (end - x >= 3) {
        const line: Coordinate[] = [];
        for (let cursor = x; cursor < end; cursor += 1) {
          line.push({ x: cursor, y });
        }
        lines.push(line);
      }
      x = end;
    }
  }

  for (let x = 0; x < BOARD_COLUMNS; x += 1) {
    let y = 0;
    while (y < board.length) {
      const cell = board[y]?.[x] ?? null;
      if (!isMatchable(cell)) {
        y += 1;
        continue;
      }
      let end = y + 1;
      while (
        end < board.length &&
        isMatchable(board[end][x]) &&
        (board[end][x] as BlockCell).flavor === cell.flavor
      ) {
        end += 1;
      }
      if (end - y >= 3) {
        const line: Coordinate[] = [];
        for (let cursor = y; cursor < end; cursor += 1) {
          line.push({ x, y: cursor });
        }
        lines.push(line);
      }
      y = end;
    }
  }

  if (lines.length === 0) return { coordinates: [], patterns: [] };

  // Crack Attack reports an intersecting cross as one elimination, but two
  // independent lines as two eliminations. Late eliminations each advance the
  // combo multiplier, even when they land on the same simulation step.
  const parents = lines.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const unite = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const ownerByCoordinate = new Map<string, number>();
  lines.forEach((line, lineIndex) => {
    for (const coordinate of line) {
      const key = coordinateKey(coordinate.x, coordinate.y);
      const owner = ownerByCoordinate.get(key);
      if (owner === undefined) ownerByCoordinate.set(key, lineIndex);
      else unite(owner, lineIndex);
    }
  });

  const coordinatesByPattern = new Map<number, Map<string, Coordinate>>();
  lines.forEach((line, lineIndex) => {
    const root = find(lineIndex);
    const pattern = coordinatesByPattern.get(root) ?? new Map<string, Coordinate>();
    for (const coordinate of line) {
      pattern.set(coordinateKey(coordinate.x, coordinate.y), coordinate);
    }
    coordinatesByPattern.set(root, pattern);
  });

  const patterns = [...coordinatesByPattern.values()].map((pattern): MatchPattern => {
    const coordinates = [...pattern.values()];
    const meanX = coordinates.reduce((sum, coordinate) => sum + coordinate.x, 0)
      / coordinates.length;
    const meanY = coordinates.reduce((sum, coordinate) => sum + coordinate.y, 0)
      / coordinates.length;
    const anchor = coordinates.reduce((closest, coordinate) => {
      const closestDistance = (closest.x - meanX) ** 2 + (closest.y - meanY) ** 2;
      const distance = (coordinate.x - meanX) ** 2 + (coordinate.y - meanY) ** 2;
      return distance < closestDistance ? coordinate : closest;
    });
    return { coordinates, anchor };
  });
  const coordinates = new Map<string, Coordinate>();
  for (const pattern of patterns) {
    for (const coordinate of pattern.coordinates) {
      coordinates.set(coordinateKey(coordinate.x, coordinate.y), coordinate);
    }
  }
  return { coordinates: [...coordinates.values()], patterns };
}

export function findMatchCoordinates(board: Board): Coordinate[] {
  return findMatches(board).coordinates;
}

export function baseScoreFor(magnitude: number, gray = false): number {
  if (magnitude < 3) return 0;
  const normalValue = magnitude === 3 ? 2 : magnitude;
  return gray ? normalValue * 3 : normalValue;
}

export function magnitudeAttacks(
  magnitude: number,
  createdAt: number,
): AttackPayload[] {
  if (magnitude <= 3) return [];
  const widths: number[] = [];

  if (magnitude <= BOARD_COLUMNS) {
    widths.push(magnitude - 1);
  } else if (magnitude < BOARD_COLUMNS * 2 - 1) {
    widths.push(Math.ceil(magnitude / 2), Math.floor(magnitude / 2));
  } else {
    let remainder = magnitude + 3;
    while (remainder > BOARD_COLUMNS - 1) {
      widths.push(BOARD_COLUMNS - 1);
      remainder -= BOARD_COLUMNS - 1;
    }
    if (remainder >= 3) widths.push(remainder);
  }

  return widths.map((width) => ({
    height: 1,
    width,
    flavor: "normal",
    source: "clear",
    createdAt,
  }));
}

export class CrackAttackEngine {
  private board: Board = createEmptyBoard();
  private nextRow: Array<Cell | null> = emptyRow();
  private status: GameStatus = "ready";
  private statusBeforePause: GameStatus = "playing";
  private phase: Phase = "idle";
  private phaseUntil = 0;
  private backgroundSwapStarted = 0;
  private backgroundSwapUntil = 0;
  private backgroundSwapCellIds = new Set<number>();
  private backgroundFallUntil = 0;
  private lastUpdate = 0;
  private countdownUntil = 0;
  private gameOverAt = 0;
  private score = 0;
  private elapsedMs = 0;
  private rise = 0;
  private cursorX = 2;
  private cursorY = 4;
  private cursorFromX = 2;
  private cursorFromY = 4;
  private cursorMoveStarted: number | null = null;
  private chainDepth = 0;
  private chainBaseScore = 0;
  private resolvingChain = false;
  private combos = new Map<number, ComboState>();
  private nextComboId = 1;
  private legacyComboId: number | null = null;
  private dangerMs = 0;
  private wasInDanger = false;
  private raiseHeld = false;
  private raiseToRowBoundary = false;
  private queuedAttacks: QueuedAttack[] = [];
  private attackSink: AttackSink | null;
  private randomState: number;
  private nextId = 1;
  private nextGroupId = 1;
  private events: GameEvent[] = [];
  private message: string | null = null;
  private messageUntil = 0;
  private lastGain = 0;
  private rewardSigns: RewardSign[] = [];
  private deathSparks: DeathSpark[] = [];
  private rewardMotes: RewardMote[] = [];
  private nextEffectId = 1;
  private pausedAt = 0;
  private levelLights: LevelLightTransition[] = Array.from(
    { length: VISIBLE_ROWS },
    () => ({ from: 0, to: 0, startedAt: 0, duration: 0 }),
  );

  constructor(options: { seed?: number; attackSink?: AttackSink } = {}) {
    this.randomState = (options.seed ?? Date.now()) >>> 0 || 0x6d2b79f5;
    this.attackSink = options.attackSink ?? null;
    this.reset();
  }

  reset(seed?: number): void {
    if (seed !== undefined) this.randomState = seed >>> 0 || 0x6d2b79f5;
    this.board = createEmptyBoard();
    this.status = "ready";
    this.statusBeforePause = "playing";
    this.phase = "idle";
    this.phaseUntil = 0;
    this.backgroundSwapStarted = 0;
    this.backgroundSwapUntil = 0;
    this.backgroundSwapCellIds = new Set<number>();
    this.backgroundFallUntil = 0;
    this.lastUpdate = 0;
    this.countdownUntil = 0;
    this.gameOverAt = 0;
    this.score = 0;
    this.elapsedMs = 0;
    this.rise = 0;
    this.cursorX = 2;
    this.cursorY = 4;
    this.cursorFromX = 2;
    this.cursorFromY = 4;
    this.cursorMoveStarted = null;
    this.chainDepth = 0;
    this.chainBaseScore = 0;
    this.resolvingChain = false;
    this.combos = new Map<number, ComboState>();
    this.nextComboId = 1;
    this.legacyComboId = null;
    this.dangerMs = 0;
    this.wasInDanger = false;
    this.raiseHeld = false;
    this.raiseToRowBoundary = false;
    this.queuedAttacks = [];
    this.events = [];
    this.message = null;
    this.messageUntil = 0;
    this.lastGain = 0;
    this.rewardSigns = [];
    this.deathSparks = [];
    this.rewardMotes = [];
    this.nextEffectId = 1;
    this.pausedAt = 0;
    this.levelLights = Array.from(
      { length: VISIBLE_ROWS },
      () => ({ from: 0, to: 0, startedAt: 0, duration: 0 }),
    );
    this.generateInitialStack();
    this.nextRow = this.generateCreepRow();
  }

  start(now: number): void {
    if (this.status !== "ready" && this.status !== "gameover") return;
    if (this.status === "gameover") this.reset();
    this.status = "countdown";
    this.countdownUntil = now + 2650;
    this.lastUpdate = now;
    this.syncLevelLights(now);
  }

  update(now: number): void {
    if (this.lastUpdate === 0) this.lastUpdate = now;
    const delta = Math.min(50, Math.max(0, now - this.lastUpdate));
    this.lastUpdate = now;

    if (this.status === "countdown") {
      if (now >= this.countdownUntil) {
        this.status = "playing";
        this.events.push({ type: "start" });
      }
      return;
    }

    if (this.status !== "playing") return;
    this.elapsedMs += delta;
    this.pruneEffects(now);

    // Swaps, falls, clears, and garbage drops all have independent clocks in
    // the original. Advance each due clock so a newly made line never waits
    // for an unrelated breaking animation to finish.
    this.finishBackgroundSwap(now);
    this.finishBackgroundFall(now);
    this.finishDueClears(now);
    this.advancePhase(now);
    this.finishDueClears(now);
    this.announceAwakeningReveals(now);
    this.releaseDueAwakening(now);
    this.refreshPhase(now);
    if (this.status !== "playing") return;

    const topRow = this.topOccupiedRow();
    const inDanger = topRow >= VISIBLE_ROWS - 1;
    const awakening = this.awakeningCount();
    const resolutionActive = this.hasActiveClears()
      || this.backgroundFallUntil > now
      || this.phase === "falling"
      || awakening > 0;

    if (inDanger && !resolutionActive) {
      this.dangerMs += delta;
      if (!this.wasInDanger) this.events.push({ type: "danger" });
      if (this.dangerMs >= DANGER_LOSS_DELAY_MS) {
        this.finishGame(now);
        return;
      }
    } else if (!inDanger) {
      this.dangerMs = 0;
    }
    this.wasInDanger = inDanger;

    if (this.phase === "idle" && awakening === 0) {
      const dueIndex = this.queuedAttacks.findIndex((attack) => attack.dropAt <= now);
      if (dueIndex >= 0) {
        const [attack] = this.queuedAttacks.splice(dueIndex, 1);
        if (!this.dropGarbage(attack, now)) {
          attack.dropAt = now + 1000;
          this.queuedAttacks.push(attack);
          this.sortAttackQueue();
        }
        return;
      }
    }

    if (this.phase !== "idle" || inDanger || awakening > 0) return;

    const normalStep = Math.min(2400, 20 + 20 * Math.floor(this.elapsedMs / 10000));
    const normalRowsPerSecond = normalStep / 1440;
    const manualRaiseActive = this.raiseHeld || this.raiseToRowBoundary;
    const rowsPerSecond = manualRaiseActive ? 2.5 : normalRowsPerSecond;
    const riseDelta = rowsPerSecond * (delta / 1000);

    // Releasing Raise commits the already-started movement through the next
    // complete row. Cap that final step at the wrap point so a quick tap never
    // leaves the stack (or cursor) parked at a fractional manual offset.
    if (this.raiseToRowBoundary && !this.raiseHeld) {
      this.rise = Math.min(1, this.rise + riseDelta);
    } else {
      this.rise += riseDelta;
    }

    while (this.rise >= 1 && this.status === "playing" && this.phase === "idle") {
      this.rise -= 1;
      this.insertCreepRow(now);
      if (this.raiseToRowBoundary && !this.raiseHeld) {
        this.raiseToRowBoundary = false;
        this.rise = 0;
      }
    }
  }

  moveCursor(dx: number, dy: number, now = this.lastUpdate): void {
    if (this.status !== "playing" && this.status !== "countdown") return;
    this.moveCursorTo(this.cursorX + dx, this.cursorY + dy, now);
  }

  setCursor(x: number, y: number, now = this.lastUpdate): void {
    if (this.status !== "playing" && this.status !== "countdown") return;
    this.moveCursorTo(x, y, now);
  }

  swap(now: number): boolean {
    if (this.status !== "playing") return false;
    // Input can arrive between animation frames. Resolve an elapsed
    // background swap before deciding whether the next one is legal.
    this.finishBackgroundSwap(now);
    const duringBackgroundAnimation = this.phase === "clearing"
      || this.phase === "garbage"
      || this.phase === "falling"
      || this.hasActiveClears();
    if (
      this.phase !== "idle"
      && !duringBackgroundAnimation
    ) return false;
    if (now < this.backgroundSwapUntil) return false;
    const x = this.cursorX;
    const y = this.cursorY;
    const leftCell = this.board[y]?.[x] ?? null;
    const rightCell = this.board[y]?.[x + 1] ?? null;
    const leftIsFallReservation = this.isFallReservation(leftCell, x, y, now);
    const rightIsFallReservation = this.isFallReservation(rightCell, x + 1, y, now);
    const left = leftIsFallReservation ? null : leftCell;
    const right = rightIsFallReservation ? null : rightCell;

    if (!left && !right) return false;
    if (left?.kind === "garbage" || right?.kind === "garbage") return false;
    if (left?.state !== undefined && left.state !== "idle") return false;
    if (right?.state !== undefined && right.state !== "idle") return false;
    if (this.cellIsMoving(left, now) || this.cellIsMoving(right, now)) return false;

    // Gravity stores a falling stack in its eventual landing cells while the
    // renderer interpolates it from above. The original leaves those cells
    // available until impact, so let a quick horizontal swap claim one and
    // retarget the falling stack to land on top of the inserted block.
    if (leftIsFallReservation && right && !this.openFallReservation(x, y, now)) {
      return false;
    }
    if (rightIsFallReservation && left && !this.openFallReservation(x + 1, y, now)) {
      return false;
    }

    this.board[y][x] = right;
    this.board[y][x + 1] = left;
    if (right) this.setMotion(right, x + 1, y, now, SWAP_DURATION_MS);
    if (left) this.setMotion(left, x, y, now, SWAP_DURATION_MS);
    if (duringBackgroundAnimation) {
      this.backgroundSwapStarted = now;
      this.backgroundSwapUntil = now + SWAP_DURATION_MS;
      this.backgroundSwapCellIds = new Set(
        [left, right]
          .filter((cell): cell is BlockCell => cell?.kind === "block")
          .map((cell) => cell.id),
      );
    } else {
      this.phase = "swapping";
      this.phaseUntil = now + SWAP_DURATION_MS;
    }
    this.events.push({ type: "swap" });
    return true;
  }

  setRaiseHeld(held: boolean): void {
    if (held && this.status === "playing") {
      this.raiseHeld = true;
      this.raiseToRowBoundary = true;
      return;
    }
    this.raiseHeld = false;
  }

  togglePause(now: number): void {
    if (this.status === "playing" || this.status === "countdown") {
      this.statusBeforePause = this.status;
      this.status = "paused";
      this.pausedAt = now;
      this.raiseHeld = false;
      this.raiseToRowBoundary = false;
      return;
    }
    if (this.status === "paused") {
      this.shiftTimers(Math.max(0, now - this.pausedAt));
      this.status = this.statusBeforePause === "countdown" ? "playing" : this.statusBeforePause;
      this.lastUpdate = now;
      this.pausedAt = 0;
    }
  }

  receiveAttack(attack: AttackPayload): void {
    const spread = 5600 + Math.floor(this.random() * 800);
    this.queuedAttacks.push({ ...attack, dropAt: attack.createdAt + spread });
    this.sortAttackQueue();
  }

  drainEvents(): GameEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  getSnapshot(now: number): GameSnapshot {
    const visualNow = this.status === "paused" ? this.pausedAt : now;
    let countdown: string | null = null;
    let countdownProgress = 0;
    if (this.status === "countdown") {
      const remaining = this.countdownUntil - visualNow;
      if (remaining > 1950) {
        countdown = "3";
        countdownProgress = (2650 - remaining) / 700;
      } else if (remaining > 1250) {
        countdown = "2";
        countdownProgress = (1950 - remaining) / 700;
      } else if (remaining > 550) {
        countdown = "1";
        countdownProgress = (1250 - remaining) / 700;
      } else {
        countdown = "GO!";
        countdownProgress = (550 - remaining) / 550;
      }
    }
    if (this.status !== "ready") this.syncLevelLights(visualNow);
    const activeMessage = visualNow < this.messageUntil ? this.message : null;
    const awakeningCount = this.awakeningCount();
    const nextAwakeningAt = this.nextAwakeningReleaseAt();
    const cursor = this.cursorVisualPosition(visualNow);
    return {
      board: this.board,
      nextRow: this.nextRow,
      status: this.status,
      phase: this.phase,
      score: this.score,
      elapsedMs: this.elapsedMs,
      rise: this.rise,
      cursorX: this.cursorX,
      cursorY: this.cursorY,
      cursorRenderX: cursor.x,
      cursorRenderY: cursor.y,
      swapProgress: this.phase === "swapping"
        ? Math.max(0, Math.min(1, 1 - (this.phaseUntil - visualNow) / SWAP_DURATION_MS))
        : visualNow < this.backgroundSwapUntil
          ? Math.max(
            0,
            Math.min(1, (visualNow - this.backgroundSwapStarted) / SWAP_DURATION_MS),
          )
          : 0,
      chainDepth: this.chainDepth,
      topOccupiedRow: this.topOccupiedRow(),
      levelLightBlends: this.levelLights.map((_, index) => (
        this.levelLightBlendAt(index, visualNow)
      )),
      dangerMs: this.dangerMs,
      incomingCount: this.queuedAttacks.length,
      nextIncomingMs: this.queuedAttacks.length
        ? Math.max(0, this.queuedAttacks[0].dropAt - visualNow)
        : null,
      countdown,
      countdownProgress: Math.max(0, Math.min(1, countdownProgress)),
      gameOverElapsedMs: this.status === "gameover"
        ? Math.max(0, visualNow - this.gameOverAt)
        : 0,
      message: activeMessage,
      messageUntil: this.messageUntil,
      lastGain: this.lastGain,
      rewardSigns: this.rewardSigns.filter((sign) => visualNow < sign.until),
      deathSparks: this.deathSparks.filter((spark) => visualNow < spark.until),
      rewardMotes: this.rewardMotes.filter((mote) => visualNow < mote.until),
      awakeningCount,
      nextAwakeningMs: nextAwakeningAt === null ? null : Math.max(0, nextAwakeningAt - visualNow),
      visualNow,
    };
  }

  private advancePhase(now: number): void {
    let guard = 0;
    while (this.phase !== "idle" && now >= this.phaseUntil && guard < 6) {
      guard += 1;
      const completedPhase = this.phase;
      this.phase = "idle";
      this.phaseUntil = 0;
      if (completedPhase === "swapping") {
        this.afterSwap(now);
      } else if (completedPhase === "clearing") {
        this.finishClear(now);
      } else if (completedPhase === "falling") {
        this.afterFall(now);
      } else if (completedPhase === "garbage") {
        this.finishGarbage(now);
      }
      this.refreshPhase(now);
    }
  }

  private finishBackgroundSwap(now: number): void {
    if (this.backgroundSwapUntil <= 0 || now < this.backgroundSwapUntil) return;

    this.backgroundSwapStarted = 0;
    this.backgroundSwapUntil = 0;
    this.backgroundSwapCellIds.clear();

    const fallDuration = this.applyGravity(now);
    if (fallDuration > 0) this.scheduleFall(now, fallDuration);
    else this.resolveMatches(now, true);
    this.refreshPhase(now);
  }

  private finishBackgroundFall(now: number): void {
    if (this.backgroundFallUntil <= 0 || now < this.backgroundFallUntil) return;
    this.backgroundFallUntil = 0;
    const fallDuration = this.applyGravity(now);
    if (fallDuration > 0) this.scheduleFall(now, fallDuration);
    else this.resolveMatches(now);
    this.refreshPhase(now);
  }

  private finishGarbage(now: number): void {
    const fallDuration = this.applyGravity(now);
    const pendingMotionUntil = Math.max(
      this.backgroundSwapUntil,
      this.backgroundFallUntil,
    );
    if (fallDuration > 0) {
      this.scheduleFall(now, Math.max(fallDuration, pendingMotionUntil - now));
      return;
    }
    if (now < pendingMotionUntil) {
      this.backgroundFallUntil = Math.max(this.backgroundFallUntil, pendingMotionUntil);
      this.refreshPhase(now);
      return;
    }
    this.resolveMatches(now);
    this.refreshPhase(now);
  }

  private afterSwap(now: number): void {
    const fallDuration = this.applyGravity(now);
    if (fallDuration > 0) {
      this.scheduleFall(now, fallDuration);
    } else {
      this.resolveMatches(now, true);
      this.refreshPhase(now);
    }
  }

  private afterFall(now: number): void {
    this.backgroundFallUntil = 0;
    const fallDuration = this.applyGravity(now);
    if (fallDuration > 0) {
      this.scheduleFall(now, fallDuration);
      return;
    }
    this.resolveMatches(now);
    this.refreshPhase(now);
  }

  private startClear(
    matches: Coordinate[],
    chainStep: boolean,
    now: number,
    patterns: MatchPattern[] = [],
  ): void {
    const effectivePatterns = patterns.length > 0
      ? patterns
      : [{ coordinates: matches, anchor: this.anchorFor(matches) }];
    let combo: ComboState;
    let continuation = false;
    if (chainStep && this.resolvingChain) {
      combo = this.legacyComboId === null
        ? this.createCombo(
          now - 1,
          Math.max(1, this.chainDepth),
          this.chainBaseScore,
        )
        : this.combos.get(this.legacyComboId)
          ?? this.createCombo(
            now - 1,
            Math.max(1, this.chainDepth),
            this.chainBaseScore,
          );
      this.legacyComboId = combo.id;
      continuation = true;
    } else {
      combo = this.createCombo(now);
      this.legacyComboId = combo.id;
    }
    if (continuation && effectivePatterns.length > 1) {
      for (const pattern of effectivePatterns) {
        this.startClearForCombo(
          pattern.coordinates,
          [pattern],
          combo,
          true,
          now,
        );
      }
      return;
    }
    this.startClearForCombo(matches, effectivePatterns, combo, continuation, now);
  }

  private startClearForCombo(
    matches: Coordinate[],
    effectivePatterns: MatchPattern[],
    combo: ComboState,
    continuation: boolean,
    now: number,
  ): void {
    const multiplierIncrements = continuation && now !== combo.createdAt
      ? effectivePatterns.length
      : 0;
    const previousDepth = combo.multiplier;
    if (multiplierIncrements > 0) {
      combo.multiplier += multiplierIncrements;
      effectivePatterns.forEach((pattern, index) => {
        const depth = previousDepth + index + 1;
        this.events.push({ type: "chain", depth });
        this.createRewardSign("multiplier", depth, pattern.anchor, now, index);
        this.createRewardMote("multiplier", pattern.anchor, depth, now, 620, index);
      });
    }

    const clearUntil = now + BLOCK_CLEAR_DURATION_MS;
    let normalMagnitude = 0;
    let grayMagnitude = 0;
    const directGarbage = new Set<number>();

    for (const { x, y } of matches) {
      const cell = this.board[y][x];
      if (!cell || cell.kind !== "block" || cell.state !== "idle") continue;
      cell.state = "clearing";
      cell.clearStarted = now;
      cell.clearUntil = clearUntil;
      cell.comboId = combo.id;
      if (cell.flavor === GRAY_FLAVOR) grayMagnitude += 1;
      else normalMagnitude += 1;

      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const neighbor = this.board[y + dy]?.[x + dx] ?? null;
        if (neighbor?.kind === "garbage") directGarbage.add(neighbor.groupId);
      }
    }

    // Garbage starts revealing on its own original 65-tick clock; it does not
    // wait for the neighboring block's full 90-tick death animation.
    this.markShatteringGarbage(
      directGarbage,
      now,
      now + AWAKEN_INITIAL_DELAY_MS,
      combo.id,
    );

    const base = baseScoreFor(normalMagnitude) + baseScoreFor(grayMagnitude, true);
    const priorBase = combo.baseAccumulatedScore;
    const gain = base * combo.multiplier + priorBase * multiplierIncrements;
    combo.baseAccumulatedScore += base;
    this.score += gain;
    this.lastGain = gain;

    const totalMagnitude = normalMagnitude + grayMagnitude;
    const deathSparkCount = Math.min(18, totalMagnitude + combo.multiplier - 1);
    for (const { x, y } of matches) {
      const cell = this.board[y]?.[x] ?? null;
      if (cell?.kind === "block" && cell.state === "clearing") {
        cell.deathSparkCount = deathSparkCount;
      }
    }
    this.events.push({
      type: "clear",
      magnitude: totalMagnitude,
      gray: grayMagnitude > 0,
    });

    const signAnchor = effectivePatterns[effectivePatterns.length - 1].anchor;
    let moteSibling = multiplierIncrements;
    for (const attack of magnitudeAttacks(normalMagnitude, now)) {
      this.createRewardMote(
        "magnitude",
        signAnchor,
        Math.max(0, Math.min(3, attack.width - 3)),
        now,
        620,
        moteSibling++,
      );
      this.emitAttack(attack);
    }
    for (let n = 0; n < Math.max(0, grayMagnitude - 2); n += 1) {
      this.createRewardMote("magnitude", signAnchor, 3, now, 620, moteSibling++);
      this.emitAttack({
        height: 1,
        width: BOARD_COLUMNS,
        flavor: "gray",
        source: "clear",
        createdAt: now,
      });
    }

    if (totalMagnitude > 3) {
      this.createRewardSign("magnitude", totalMagnitude, signAnchor, now, multiplierIncrements);
    }
    // The original deliberately shows no sign at all for an ordinary match
    // of three; points still accrue in the score display.
    this.message = null;
    this.messageUntil = 0;

    this.syncChainSummary(combo);
    this.refreshPhase(now);
  }

  private finishClear(now: number): void {
    const dueBlocks: Array<{ x: number; y: number; cell: BlockCell }> = [];
    const shattering: Array<{ x: number; y: number; cell: GarbageCell }> = [];
    for (let y = 0; y < this.board.length; y += 1) {
      for (let x = 0; x < BOARD_COLUMNS; x += 1) {
        const cell = this.board[y][x];
        if (!cell) continue;
        if (
          cell.kind === "block"
          && cell.state === "clearing"
          && (cell.clearUntil ?? Number.POSITIVE_INFINITY) <= now
        ) {
          dueBlocks.push({ x, y, cell });
        } else if (
          cell.kind === "garbage"
          && cell.state === "shattering"
          && (cell.clearUntil ?? Number.POSITIVE_INFINITY) <= now
        ) {
          shattering.push({ x, y, cell });
        }
      }
    }

    if (dueBlocks.length === 0 && shattering.length === 0) {
      this.refreshPhase(now);
      return;
    }

    for (const { x, y, cell } of dueBlocks) {
          this.createBlockDeathSparks(
            x,
            y,
            cell.flavor,
            cell.deathSparkCount ?? 3,
            now,
          );
          this.board[y][x] = null;
    }

    shattering.sort((a, b) => a.y - b.y || a.x - b.x);
    if (shattering.length > 0) {
      const shatterStarted = Math.min(
        ...shattering.map(({ cell }) => cell.clearStarted ?? now),
      );
      const maxSequence = Math.max(
        shattering.length - 1,
        ...shattering.map(({ cell }, index) => cell.shatterSequence ?? index),
      );
      const releaseAt = shatterStarted
        + AWAKEN_INITIAL_DELAY_MS
        + AWAKEN_INTERNAL_DELAY_MS * maxSequence
        + AWAKEN_FINAL_DELAY_MS;
      const groups = new Map<number, typeof shattering>();
      for (const position of shattering) {
        const positions = groups.get(position.cell.groupId) ?? [];
        positions.push(position);
        groups.set(position.cell.groupId, positions);
      }
      const reformingRows = new Set<string>();
      const prepared = shattering.every(({ cell }) => (
        cell.shatterSequence !== undefined
        && (cell.shatterReforms === true || cell.shatterTargetFlavor !== undefined)
      ));
      if (prepared) {
        for (const { y, cell } of shattering) {
          if (cell.shatterReforms) reformingRows.add(`${cell.groupId}:${y}`);
        }
      } else {
        for (const [groupId, positions] of groups) {
          const minY = Math.min(...positions.map(({ y }) => y));
          const width = new Set(positions.map(({ x }) => x)).size;
          const rows = [...new Set(positions.map(({ y }) => y))].sort((a, b) => a - b);
          for (const y of rows) {
            if (
              width === BOARD_COLUMNS
              && ((y - minY) & 1) === 1
              && this.random() < GARBAGE_ROW_REFORM_CHANCE
            ) reformingRows.add(`${groupId}:${y}`);
          }
        }
      }

      const blockPositions = shattering.filter(({ y, cell }) => (
        !reformingRows.has(`${cell.groupId}:${y}`)
      ));
      const flavors = prepared ? [] : this.generateAwakeningFlavors(blockPositions);
      let flavorIndex = 0;
      const reformedGroupIds = new Map<string, number>();

      shattering.forEach(({ x, y, cell }, fallbackSequence) => {
        const sequence = cell.shatterSequence ?? fallbackSequence;
        const revealAt = shatterStarted
          + AWAKEN_INITIAL_DELAY_MS
          + AWAKEN_INTERNAL_DELAY_MS * sequence;
        const reformKey = `${cell.groupId}:${y}`;
        if (reformingRows.has(reformKey)) {
          const groupId = reformedGroupIds.get(reformKey) ?? this.nextGroupId++;
          reformedGroupIds.set(reformKey, groupId);
          this.board[y][x] = {
            id: this.nextId++,
            kind: "garbage",
            groupId,
            flavor: "normal",
            texture: cell.texture,
            state: "awakening",
            awakenRevealAt: revealAt,
            awakenReleaseAt: releaseAt,
            awakenSource: cell.flavor,
            awakenSequence: sequence,
            comboId: cell.comboId,
          };
          return;
        }

        const replacement = this.createBlock(
          cell.shatterTargetFlavor ?? flavors[flavorIndex++],
        );
        replacement.state = "awakening";
        replacement.awakenRevealAt = revealAt;
        replacement.awakenReleaseAt = releaseAt;
        replacement.awakenSource = cell.flavor;
        replacement.awakenSequence = sequence;
        replacement.awakenNotified = false;
        replacement.comboId = cell.comboId;
        this.board[y][x] = replacement;
      });
    }

    for (const { x, y, cell } of dueBlocks) {
      if (cell.comboId !== undefined) this.propagateComboAbove(x, y, cell.comboId);
    }

    const fallDuration = this.applyGravity(now);
    if (fallDuration > 0) {
      this.scheduleFall(now, fallDuration);
    } else if (now < this.backgroundSwapUntil) {
      this.backgroundFallUntil = Math.max(this.backgroundFallUntil, this.backgroundSwapUntil);
    } else {
      this.resolveMatches(now);
    }
    this.completeDormantCombos(now);
    this.refreshPhase(now);
  }

  private announceAwakeningReveals(now: number): void {
    for (const row of this.board) {
      for (const cell of row) {
        if (
          cell?.kind !== "block"
          || cell.state !== "awakening"
          || cell.awakenNotified
          || cell.awakenRevealAt === undefined
          || now < cell.awakenRevealAt
        ) continue;
        cell.awakenNotified = true;
        this.events.push({
          type: "awaken",
          flavor: cell.flavor,
          sequence: cell.awakenSequence ?? 0,
        });
      }
    }
  }

  private releaseDueAwakening(now: number): void {
    let released = false;
    for (const row of this.board) {
      for (const cell of row) {
        if (
          !cell
          || cell.state !== "awakening"
          || cell.awakenReleaseAt === undefined
          || now < cell.awakenReleaseAt
        ) continue;
        cell.state = "idle";
        released = true;
      }
    }
    if (!released) return;

    const fallDuration = this.applyGravity(now, true);
    if (fallDuration > 0) {
      this.scheduleFall(now, fallDuration);
      return;
    }
    this.resolveMatches(now);
    this.refreshPhase(now);
  }

  private hasAwakening(): boolean {
    return this.awakeningCount() > 0;
  }

  private awakeningCount(): number {
    let count = 0;
    for (const row of this.board) {
      for (const cell of row) {
        if (cell?.state === "awakening") count += 1;
      }
    }
    return count;
  }

  private nextAwakeningReleaseAt(): number | null {
    let next: number | null = null;
    for (const row of this.board) {
      for (const cell of row) {
        if (
          !cell
          || cell.state !== "awakening"
          || cell.awakenReleaseAt === undefined
        ) continue;
        next = next === null ? cell.awakenReleaseAt : Math.min(next, cell.awakenReleaseAt);
      }
    }
    return next;
  }

  private generateAwakeningFlavors(
    positions: Array<{ x: number; y: number; cell: GarbageCell }>,
  ): BlockFlavor[] {
    const result: BlockFlavor[] = [];
    const lastByColumn = Array.from({ length: BOARD_COLUMNS }, () => [] as BlockFlavor[]);

    for (const { x } of positions) {
      let flavor = this.randomNormalFlavor();
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const horizontalTriple = result.length >= 2
          && result[result.length - 1] === flavor
          && result[result.length - 2] === flavor;
        const column = lastByColumn[x];
        const verticalTriple = column.length >= 2
          && column[column.length - 1] === flavor
          && column[column.length - 2] === flavor;
        if (!horizontalTriple && !verticalTriple) break;
        flavor = this.randomNormalFlavor();
      }
      result.push(flavor);
      lastByColumn[x].push(flavor);
    }
    return result;
  }

  private shiftTimers(duration: number): void {
    if (duration <= 0) return;
    const shiftCell = (cell: Cell | null): void => {
      if (!cell) return;
      if (cell.animationStarted !== undefined) cell.animationStarted += duration;
      if (cell.clearStarted !== undefined) cell.clearStarted += duration;
      if (cell.clearUntil !== undefined) cell.clearUntil += duration;
      if (cell.awakenRevealAt !== undefined) cell.awakenRevealAt += duration;
      if (cell.awakenReleaseAt !== undefined) cell.awakenReleaseAt += duration;
    };

    for (const row of this.board) for (const cell of row) shiftCell(cell);
    for (const cell of this.nextRow) shiftCell(cell);
    if (this.phaseUntil > 0) this.phaseUntil += duration;
    if (this.backgroundSwapStarted > 0) this.backgroundSwapStarted += duration;
    if (this.backgroundSwapUntil > 0) this.backgroundSwapUntil += duration;
    if (this.backgroundFallUntil > 0) this.backgroundFallUntil += duration;
    if (this.countdownUntil > 0) this.countdownUntil += duration;
    if (this.messageUntil > 0) this.messageUntil += duration;
    if (this.cursorMoveStarted !== null) this.cursorMoveStarted += duration;
    for (const attack of this.queuedAttacks) attack.dropAt += duration;
    for (const sign of this.rewardSigns) {
      sign.startedAt += duration;
      sign.until += duration;
    }
    for (const spark of this.deathSparks) {
      spark.startedAt += duration;
      spark.until += duration;
    }
    for (const mote of this.rewardMotes) {
      mote.startedAt += duration;
      mote.launchAt += duration;
      mote.until += duration;
    }
    for (const light of this.levelLights) {
      if (light.duration > 0) light.startedAt += duration;
    }
  }

  private createCombo(
    createdAt: number,
    multiplier = 1,
    baseAccumulatedScore = 0,
  ): ComboState {
    const combo: ComboState = {
      id: this.nextComboId++,
      createdAt,
      multiplier,
      baseAccumulatedScore,
    };
    this.combos.set(combo.id, combo);
    this.syncChainSummary(combo);
    return combo;
  }

  private syncChainSummary(preferred?: ComboState): void {
    const active = [...this.combos.values()];
    if (active.length === 0) {
      this.resolvingChain = false;
      this.chainDepth = 0;
      this.chainBaseScore = 0;
      return;
    }
    const selected = preferred && this.combos.has(preferred.id)
      ? preferred
      : active.reduce((best, combo) => (
        combo.multiplier > best.multiplier ? combo : best
      ));
    this.resolvingChain = true;
    this.chainDepth = selected.multiplier;
    this.chainBaseScore = selected.baseAccumulatedScore;
  }

  private startDetectedMatches(
    result: MatchResult,
    now: number,
    sharedSwapCause = false,
  ): void {
    if (result.patterns.length === 0) return;
    const grouped = new Map<string, {
      combo: ComboState | null;
      patterns: MatchPattern[];
      coordinates: Map<string, Coordinate>;
    }>();

    result.patterns.forEach((pattern, index) => {
      const comboId = pattern.coordinates
        .map(({ x, y }) => {
          const cell = this.board[y]?.[x] ?? null;
          return cell?.kind === "block" ? cell.comboId : undefined;
        })
        .find((id): id is number => id !== undefined && this.combos.has(id));
      const combo = comboId === undefined ? null : this.combos.get(comboId) ?? null;
      // Both blocks in one completed swap share a magnitude tally in the
      // original game. Keep fresh patterns from that swap together, so (for
      // example) two separate triples score and attack as one six-block
      // elimination. Late patterns remain individual eliminations even when
      // they share a combo: two falling triples advance it to 2x and then 3x,
      // but neither becomes a magnitude-six clear.
      const key = combo
        ? `combo:${combo.id}:pattern:${index}`
        : sharedSwapCause
          ? "swap"
          : `new:${index}`;
      const entry = grouped.get(key) ?? {
        combo,
        patterns: [],
        coordinates: new Map<string, Coordinate>(),
      };
      entry.patterns.push(pattern);
      for (const coordinate of pattern.coordinates) {
        entry.coordinates.set(coordinateKey(coordinate.x, coordinate.y), coordinate);
      }
      grouped.set(key, entry);
    });

    for (const entry of grouped.values()) {
      const coordinates = [...entry.coordinates.values()];
      if (entry.combo) {
        this.startClearForCombo(coordinates, entry.patterns, entry.combo, true, now);
      } else {
        const combo = this.createCombo(now);
        this.startClearForCombo(coordinates, entry.patterns, combo, false, now);
      }
    }
  }

  private resolveMatches(now: number, sharedSwapCause = false): void {
    // A falling block is drawn over its destination but has not joined the
    // grid there yet. Hide moving cells from detection so a settled line can
    // clear beside one without accidentally including—or waiting for—it.
    const settledBoard = this.board.map((row) => row.map((cell) => (
      this.cellIsMoving(cell, now) ? null : cell
    )));
    const matches = findMatches(settledBoard);
    const matched = new Set(
      matches.coordinates.map(({ x, y }) => coordinateKey(x, y)),
    );
    const motionPending = now < this.backgroundSwapUntil
      || now < this.backgroundFallUntil;
    if (matches.coordinates.length > 0) {
      this.startDetectedMatches(matches, now, sharedSwapCause);
    }

    for (let y = 0; y < this.board.length; y += 1) {
      for (let x = 0; x < BOARD_COLUMNS; x += 1) {
        const cell = this.board[y][x];
        if (!cell || cell.comboId === undefined || cell.state !== "idle") continue;
        if (
          motionPending
          || matched.has(coordinateKey(x, y))
          || this.cellIsMoving(cell, now)
        ) continue;
        delete cell.comboId;
      }
    }
    this.completeDormantCombos(now);
  }

  private propagateComboAbove(x: number, y: number, comboId: number): void {
    for (let cursorY = y + 1; cursorY < this.board.length; cursorY += 1) {
      const cell = this.board[cursorY][x];
      if (!cell || cell.state !== "idle") break;
      cell.comboId = comboId;
    }
  }

  private completeDormantCombos(now: number): void {
    if (this.combos.size === 0) return;
    const involved = new Set<number>();
    for (const row of this.board) {
      for (const cell of row) {
        if (cell?.comboId !== undefined) involved.add(cell.comboId);
      }
    }

    for (const combo of [...this.combos.values()]) {
      if (involved.has(combo.id)) continue;
      if (combo.multiplier > 1) {
        this.emitAttack({
          height: Math.min(11, combo.multiplier - 1),
          width: BOARD_COLUMNS,
          flavor: "normal",
          source: "chain",
          createdAt: now,
        });
      }
      this.combos.delete(combo.id);
      if (this.legacyComboId === combo.id) this.legacyComboId = null;
    }
    this.syncChainSummary();
  }

  private hasActiveClears(): boolean {
    for (const row of this.board) {
      for (const cell of row) {
        if (
          (cell?.kind === "block" && cell.state === "clearing")
          || (cell?.kind === "garbage" && cell.state === "shattering")
        ) return true;
      }
    }
    return false;
  }

  private nextClearDeadline(): number | null {
    let deadline: number | null = null;
    for (const row of this.board) {
      for (const cell of row) {
        const active = (cell?.kind === "block" && cell.state === "clearing")
          || (cell?.kind === "garbage" && cell.state === "shattering");
        if (!active || cell.clearUntil === undefined) continue;
        deadline = deadline === null ? cell.clearUntil : Math.min(deadline, cell.clearUntil);
      }
    }
    return deadline;
  }

  private finishDueClears(now: number): void {
    const deadline = this.nextClearDeadline();
    if (deadline !== null && deadline <= now) this.finishClear(now);
  }

  private scheduleFall(now: number, duration: number): void {
    this.backgroundFallUntil = Math.max(
      this.backgroundFallUntil,
      now + Math.max(1, duration),
    );
    this.refreshPhase(now);
  }

  private refreshPhase(now: number): void {
    // Foreground swaps and garbage reveals own their completion callback. Keep
    // them foregrounded even if another clear deadline lands on the same tick;
    // advancePhase resets the phase before running that callback.
    if (this.phase === "swapping" || this.phase === "garbage") return;

    const clearDeadline = this.nextClearDeadline();
    if (clearDeadline !== null) {
      this.phase = "clearing";
      this.phaseUntil = clearDeadline;
      return;
    }

    if (this.backgroundFallUntil > now) {
      this.phase = "falling";
      this.phaseUntil = this.backgroundFallUntil;
      return;
    }

    this.phase = "idle";
    this.phaseUntil = 0;
  }

  private applyGravity(now: number, noHang = false): number {
    let longestFall = 0;
    let changed = true;
    let guard = 0;

    while (changed && guard < BUFFER_ROWS) {
      guard += 1;
      changed = false;

      const groups = this.collectGarbageGroups().sort((a, b) => a.minY - b.minY);
      for (const group of groups) {
        const positions = group.positions;
        if (positions.some(({ cell }) => cell.state !== "idle")) continue;
        for (const position of positions) this.board[position.y][position.x] = null;

        let drop = BUFFER_ROWS;
        for (const position of positions) {
          let available = 0;
          for (let y = position.y - 1; y >= 0; y -= 1) {
            if (this.board[y][position.x]) break;
            available += 1;
          }
          drop = Math.min(drop, available);
        }

        for (const position of positions) {
          const targetY = position.y - drop;
          this.board[targetY][position.x] = position.cell;
          if (drop > 0) longestFall = Math.max(
            longestFall,
            this.startFallMotion(
              position.cell,
              position.x,
              position.y,
              targetY,
              now,
              noHang,
            ),
          );
        }
        if (drop > 0) {
          changed = true;
        }
      }

      for (let x = 0; x < BOARD_COLUMNS; x += 1) {
        for (let y = 1; y < this.board.length; y += 1) {
          const cell = this.board[y][x];
          if (!cell || cell.kind !== "block" || cell.state !== "idle") continue;
          if (now < this.backgroundSwapUntil && this.backgroundSwapCellIds.has(cell.id)) continue;
          let targetY = y;
          while (targetY > 0 && this.board[targetY - 1][x] === null) targetY -= 1;
          if (targetY !== y) {
            this.board[targetY][x] = cell;
            this.board[y][x] = null;
            longestFall = Math.max(
              longestFall,
              this.startFallMotion(cell, x, y, targetY, now, noHang),
            );
            changed = true;
          }
        }
      }
    }

    return longestFall;
  }

  private collectGarbageGroups(): Array<{
    groupId: number;
    minY: number;
    positions: Array<Coordinate & { cell: GarbageCell }>;
  }> {
    const groups = new Map<number, Array<Coordinate & { cell: GarbageCell }>>();
    for (let y = 0; y < this.board.length; y += 1) {
      for (let x = 0; x < BOARD_COLUMNS; x += 1) {
        const cell = this.board[y][x];
        if (cell?.kind !== "garbage") continue;
        const group = groups.get(cell.groupId) ?? [];
        group.push({ x, y, cell });
        groups.set(cell.groupId, group);
      }
    }
    return [...groups.entries()].map(([groupId, positions]) => ({
      groupId,
      minY: Math.min(...positions.map((position) => position.y)),
      positions,
    }));
  }

  private markShatteringGarbage(
    direct: Set<number>,
    clearStarted: number,
    clearUntil: number,
    comboId: number,
  ): void {
    if (direct.size === 0) return;
    const groups = this.collectGarbageGroups();
    const groupById = new Map(groups.map((group) => [group.groupId, group]));
    const selected = new Set<number>(
      [...direct].filter((groupId) => (
        groupById.get(groupId)?.positions.every(({ cell }) => cell.state === "idle")
      )),
    );
    const queue = [...selected];

    while (queue.length) {
      const currentId = queue.shift() as number;
      const current = groupById.get(currentId);
      if (!current || current.positions[0].cell.flavor === "gray") continue;
      const occupied = new Set(
        current.positions.map((position) => coordinateKey(position.x, position.y)),
      );
      for (const candidate of groups) {
        if (selected.has(candidate.groupId)) continue;
        if (candidate.positions.some(({ cell }) => cell.state !== "idle")) continue;
        if (candidate.positions[0].cell.flavor === "gray") continue;
        const touching = candidate.positions.some(({ x, y }) =>
          [
            coordinateKey(x - 1, y),
            coordinateKey(x + 1, y),
            coordinateKey(x, y - 1),
            coordinateKey(x, y + 1),
          ].some((key) => occupied.has(key)),
        );
        if (touching) {
          selected.add(candidate.groupId);
          queue.push(candidate.groupId);
        }
      }
    }

    const selectedGroups = groups.filter((group) => selected.has(group.groupId));
    const reformingRows = new Set<string>();
    for (const group of selectedGroups) {
      const minY = Math.min(...group.positions.map(({ y }) => y));
      const width = new Set(group.positions.map(({ x }) => x)).size;
      const rows = [...new Set(group.positions.map(({ y }) => y))]
        .sort((a, b) => a - b);
      for (const y of rows) {
        if (
          width === BOARD_COLUMNS
          && ((y - minY) & 1) === 1
          && this.random() < GARBAGE_ROW_REFORM_CHANCE
        ) reformingRows.add(`${group.groupId}:${y}`);
      }
    }

    const positions = selectedGroups
      .flatMap((group) => group.positions)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const blockPositions = positions.filter(({ y, cell }) => (
      !reformingRows.has(`${cell.groupId}:${y}`)
    ));
    const flavors = this.generateAwakeningFlavors(blockPositions);
    let flavorIndex = 0;

    positions.forEach((position, sequence) => {
      const { cell, y } = position;
      if (cell.state !== "idle") return;
      const reforms = reformingRows.has(`${cell.groupId}:${y}`);
      cell.state = "shattering";
      cell.clearStarted = clearStarted;
      cell.clearUntil = clearUntil;
      cell.comboId = comboId;
      cell.shatterSequence = sequence;
      cell.shatterReforms = reforms;
      if (!reforms) cell.shatterTargetFlavor = flavors[flavorIndex++];
    });
  }

  private insertCreepRow(now: number): void {
    const displaced = this.board.pop();
    if (displaced?.some(Boolean)) {
      this.finishGame(now);
      return;
    }
    this.board.unshift(this.nextRow);
    // The board and the swapper share the creep offset in the original. When
    // that offset wraps, both logical grid coordinates advance together; it
    // is not a new cursor movement and must not start a glide animation.
    this.cursorY = Math.min(BUFFER_ROWS - 1, this.cursorY + 1);
    this.cursorFromY = Math.min(BUFFER_ROWS - 1, this.cursorFromY + 1);
    this.nextRow = this.generateCreepRow();
    this.events.push({ type: "rise" });

    this.resolveMatches(now);
  }

  private dropGarbage(attack: QueuedAttack, now: number): boolean {
    const width = Math.max(1, Math.min(BOARD_COLUMNS, attack.width));
    const height = Math.max(1, Math.min(11, attack.height));
    const x = width === BOARD_COLUMNS
      ? 0
      : Math.floor(this.random() * (BOARD_COLUMNS - width + 1));
    let landingY = 0;
    for (let column = x; column < x + width; column += 1) {
      let columnTop = -1;
      for (let y = this.board.length - 1; y >= 0; y -= 1) {
        if (this.board[y][column]) {
          columnTop = y;
          break;
        }
      }
      landingY = Math.max(landingY, columnTop + 1);
    }
    if (landingY + height >= BUFFER_ROWS) return false;

    const groupId = this.nextGroupId++;
    const texture = Math.floor(this.random() * 6);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const cell: GarbageCell = {
          id: this.nextId++,
          kind: "garbage",
          groupId,
          flavor: attack.flavor,
          texture,
          state: "idle",
          animationFromX: x + column,
          animationFromY: VISIBLE_ROWS + height + row,
          animationStarted: now,
          animationDuration: 430,
        };
        this.board[landingY + row][x + column] = cell;
      }
    }
    this.phase = "garbage";
    this.phaseUntil = now + 430;
    this.events.push({ type: "garbage" });
    return true;
  }

  private emitAttack(attack: AttackPayload): void {
    if (this.attackSink) this.attackSink(attack);
    else this.receiveAttack(attack);
  }

  private generateInitialStack(): void {
    const shortColumn = Math.floor(this.random() * BOARD_COLUMNS);
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      const height = (x === shortColumn ? 1 : 6) + Math.floor(this.random() * 2);
      for (let y = 0; y < height; y += 1) {
        const flavor = this.pickSafeFlavor(x, y, false);
        this.board[y][x] = this.createBlock(flavor);
      }
    }
  }

  private generateCreepRow(): Array<Cell | null> {
    const row = emptyRow();
    const specialColumn = this.random() < 2 / 3
      ? Math.floor(this.random() * BOARD_COLUMNS)
      : -1;

    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      const preferred = x === specialColumn ? GRAY_FLAVOR : null;
      const flavor = this.pickSafeFlavorForRow(row, x, preferred);
      row[x] = this.createBlock(flavor);
    }
    return row;
  }

  private pickSafeFlavor(x: number, y: number, allowGray: boolean): BlockFlavor {
    const maximum = allowGray ? NORMAL_FLAVOR_COUNT + 1 : NORMAL_FLAVOR_COUNT;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const flavor = Math.floor(this.random() * maximum) as BlockFlavor;
      const horizontal = x >= 2
        && (this.board[y][x - 1] as BlockCell | null)?.flavor === flavor
        && (this.board[y][x - 2] as BlockCell | null)?.flavor === flavor;
      const vertical = y >= 2
        && (this.board[y - 1][x] as BlockCell | null)?.flavor === flavor
        && (this.board[y - 2][x] as BlockCell | null)?.flavor === flavor;
      if (!horizontal && !vertical) return flavor;
    }
    return 0;
  }

  private pickSafeFlavorForRow(
    row: Array<Cell | null>,
    x: number,
    preferred: BlockFlavor | null,
  ): BlockFlavor {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const flavor = (attempt === 0 && preferred !== null
        ? preferred
        : this.randomNormalFlavor()) as BlockFlavor;
      const horizontal = x >= 2
        && (row[x - 1] as BlockCell | null)?.flavor === flavor
        && (row[x - 2] as BlockCell | null)?.flavor === flavor;
      const vertical = (this.board[0][x] as BlockCell | null)?.flavor === flavor
        && (this.board[1][x] as BlockCell | null)?.flavor === flavor;
      if (!horizontal && !vertical) return flavor;
    }
    return this.randomNormalFlavor();
  }

  private createBlock(flavor: BlockFlavor): BlockCell {
    return {
      id: this.nextId++,
      kind: "block",
      flavor,
      state: "idle",
    };
  }

  private randomNormalFlavor(): BlockFlavor {
    return Math.floor(this.random() * NORMAL_FLAVOR_COUNT) as BlockFlavor;
  }

  private random(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x100000000;
  }

  private setMotion(
    cell: Cell,
    fromX: number,
    fromY: number,
    now: number,
    duration: number,
    delay = 0,
  ): void {
    cell.animationFromX = fromX;
    cell.animationFromY = fromY;
    cell.animationStarted = now;
    cell.animationDuration = duration;
    cell.animationDelay = delay;
  }

  private isVerticalFallMotion(
    cell: Cell | null,
    x: number,
    targetY: number,
    now: number,
  ): cell is Cell {
    return cell !== null
      && cell.state === "idle"
      && this.cellIsMoving(cell, now)
      && (cell.animationFromX ?? x) === x
      && (cell.animationFromY ?? targetY) > targetY;
  }

  private startFallMotion(
    cell: Cell,
    x: number,
    logicalFromY: number,
    targetY: number,
    now: number,
    noHang = false,
  ): number {
    const continuing = this.isVerticalFallMotion(cell, x, logicalFromY, now);
    const fromY = continuing
      ? this.motionYAt(cell, logicalFromY, now)
      : logicalFromY;
    const delay = continuing || noHang ? 0 : FALL_HANG_MS;
    const duration = Math.max(
      1,
      delay + Math.max(0, fromY - targetY) * FALL_ROW_MS,
    );
    this.setMotion(cell, x, fromY, now, duration, delay);
    return duration;
  }

  private isFallReservation(
    cell: Cell | null,
    x: number,
    y: number,
    now: number,
  ): cell is BlockCell {
    return cell?.kind === "block"
      && this.isVerticalFallMotion(cell, x, y, now);
  }

  private motionYAt(cell: Cell, targetY: number, now: number): number {
    if (
      cell.animationStarted === undefined
      || cell.animationDuration === undefined
      || now >= cell.animationStarted + cell.animationDuration
    ) return targetY;
    const delay = cell.animationDelay ?? 0;
    const travelDuration = Math.max(1, cell.animationDuration - delay);
    const raw = Math.max(
      0,
      Math.min(
        1,
        (now - cell.animationStarted - delay) / travelDuration,
      ),
    );
    const fromY = cell.animationFromY ?? targetY;
    return fromY + (targetY - fromY) * raw;
  }

  private openFallReservation(x: number, y: number, now: number): boolean {
    const stack: Array<{ y: number; cell: BlockCell; visualY: number }> = [];
    let cursorY = y;
    while (cursorY < this.board.length) {
      const cell = this.board[cursorY][x];
      if (!this.isFallReservation(cell, x, cursorY, now)) break;
      stack.push({
        y: cursorY,
        cell,
        visualY: this.motionYAt(cell, cursorY, now),
      });
      cursorY += 1;
    }
    if (stack.length === 0) return false;
    if (cursorY >= this.board.length || this.board[cursorY][x] !== null) return false;

    // Once the lowest block has crossed its new landing height, the input was
    // too late—matching the original's narrow timing window.
    if (stack.some((entry) => entry.visualY < entry.y + 1)) return false;

    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const entry = stack[index];
      this.board[entry.y + 1][x] = entry.cell;
      this.board[entry.y][x] = null;
      this.setMotion(
        entry.cell,
        x,
        entry.visualY,
        now,
        Math.max(1, (entry.visualY - (entry.y + 1)) * FALL_ROW_MS),
      );
    }
    this.backgroundFallUntil = this.latestFallDeadline(now);
    return true;
  }

  private latestFallDeadline(now: number): number {
    let deadline = 0;
    for (let y = 0; y < this.board.length; y += 1) {
      for (let x = 0; x < BOARD_COLUMNS; x += 1) {
        const cell = this.board[y][x];
        if (!this.isVerticalFallMotion(cell, x, y, now)) continue;
        deadline = Math.max(
          deadline,
          (cell.animationStarted ?? now) + (cell.animationDuration ?? 0),
        );
      }
    }
    return deadline;
  }

  private cellIsMoving(cell: Cell | null, now: number): boolean {
    return cell?.animationStarted !== undefined
      && cell.animationDuration !== undefined
      && now < cell.animationStarted + cell.animationDuration;
  }

  private cursorVisualPosition(now: number): Coordinate {
    if (this.cursorMoveStarted === null) return { x: this.cursorX, y: this.cursorY };
    const progress = Math.max(
      0,
      Math.min(1, (now - this.cursorMoveStarted) / CURSOR_MOVE_DURATION_MS),
    );
    const eased = 1 - (1 - progress) ** 2;
    return {
      x: this.cursorFromX + (this.cursorX - this.cursorFromX) * eased,
      y: this.cursorFromY + (this.cursorY - this.cursorFromY) * eased,
    };
  }

  private moveCursorTo(x: number, y: number, now: number): void {
    const targetX = Math.max(0, Math.min(BOARD_COLUMNS - 2, Math.floor(x)));
    const targetY = Math.max(0, Math.min(VISIBLE_ROWS - 1, Math.floor(y)));
    if (targetX === this.cursorX && targetY === this.cursorY) return;

    const visual = this.cursorVisualPosition(now);
    this.cursorFromX = visual.x;
    this.cursorFromY = visual.y;
    this.cursorX = targetX;
    this.cursorY = targetY;
    this.cursorMoveStarted = now;
  }

  private topOccupiedRow(): number {
    for (let y = this.board.length - 1; y >= 0; y -= 1) {
      if (this.board[y].some(Boolean)) return y;
    }
    return -1;
  }

  private levelLightBlendAt(index: number, now: number): number {
    const light = this.levelLights[index];
    if (!light || light.duration <= 0) return light?.to ?? 0;
    const progress = Math.max(0, Math.min(1, (now - light.startedAt) / light.duration));
    return light.from + (light.to - light.from) * progress;
  }

  private syncLevelLights(now: number): void {
    const topRow = this.topOccupiedRow();
    for (let level = 0; level < VISIBLE_ROWS; level += 1) {
      const light = this.levelLights[level];
      const target = topRow >= level ? 1 : 0;
      if (light.to === target) continue;
      const current = this.levelLightBlendAt(level, now);
      light.from = current;
      light.to = target;
      light.startedAt = now;
      light.duration = LEVEL_LIGHT_FADE_MS * Math.abs(target - current);
    }
  }

  private sortAttackQueue(): void {
    this.queuedAttacks.sort((a, b) => a.dropAt - b.dropAt);
  }

  private anchorFor(coordinates: Coordinate[]): Coordinate {
    const meanX = coordinates.reduce((sum, coordinate) => sum + coordinate.x, 0)
      / coordinates.length;
    const meanY = coordinates.reduce((sum, coordinate) => sum + coordinate.y, 0)
      / coordinates.length;
    return coordinates.reduce((closest, coordinate) => {
      const closestDistance = (closest.x - meanX) ** 2 + (closest.y - meanY) ** 2;
      const distance = (coordinate.x - meanX) ** 2 + (coordinate.y - meanY) ** 2;
      return distance < closestDistance ? coordinate : closest;
    });
  }

  private createRewardSign(
    kind: RewardSign["kind"],
    value: number,
    anchor: Coordinate,
    now: number,
    sibling: number,
  ): void {
    const multiplier = kind === "multiplier";
    this.rewardSigns.push({
      id: this.nextEffectId++,
      kind,
      value: Math.max(multiplier ? 2 : 4, Math.min(12, value)),
      x: Math.max(0, Math.min(BOARD_COLUMNS - 1, anchor.x + (multiplier ? 1 : 0))),
      y: Math.max(0, anchor.y - (multiplier ? 1 : 0) + sibling * 0.18)
        + this.rise,
      jitterX: (this.random() - 0.5) * 10,
      jitterY: (this.random() - 0.5) * 10,
      startedAt: now,
      until: now + REWARD_SIGN_LIFETIME_MS,
    });
  }

  private createBlockDeathSparks(
    x: number,
    y: number,
    flavor: BlockFlavor,
    count: number,
    now: number,
  ): void {
    for (let index = 0; index < count && this.deathSparks.length < 400; index += 1) {
      const angle = Math.PI / 4 + this.random() * Math.PI / 2;
      const speed = 0.55 + ((this.random() + this.random()) / 2) * 4;
      const baseLife = 900 + ((this.random() + this.random()) / 2) * 1700;
      const longLife = this.random() < 1 / 40 ? 2200 + this.random() * 3400 : baseLife;
      const sizeRoll = Math.floor(this.random() * 4);
      const size = sizeRoll === 0
        ? 0.4
        : sizeRoll === 1
          ? 0.4 + this.random() * 0.6
          : 1;
      this.deathSparks.push({
        id: this.nextEffectId++,
        flavor,
        x: x + 0.5,
        y: y + 0.5 + this.rise,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        rotation: this.random() * Math.PI * 2,
        angularVelocity: (this.random() < 0.5 ? -1 : 1) * (3 + this.random() * 14),
        size,
        startedAt: now,
        until: now + longLife,
      });
    }
  }

  private createRewardMote(
    kind: "magnitude" | "multiplier",
    anchor: Coordinate,
    level: number,
    now: number,
    holdMs: number,
    sibling: number,
  ): void {
    const magnitudeStyles: SparkleStyle[] = ["four", "five", "six", "special"];
    let style: SparkleStyle;
    let size: number;
    if (kind === "multiplier") {
      if (level <= 2) {
        style = "multiplier-one";
        size = 42;
      } else if (level === 3) {
        style = "multiplier-two";
        size = 30;
      } else {
        style = "multiplier-three";
        size = Math.min(54, 37 + (level - 4) * 3);
      }
    } else {
      const clampedLevel = Math.max(0, Math.min(3, level));
      style = magnitudeStyles[clampedLevel];
      size = [22, 30, 30, 36][clampedLevel];
    }
    const launchAt = now + holdMs + sibling * 140;
    const sourceX = anchor.x + 0.5;
    this.rewardMotes.push({
      id: this.nextEffectId++,
      style,
      x: sourceX,
      y: anchor.y + 0.5 + this.rise,
      outward: (sourceX < BOARD_COLUMNS / 2 ? -1 : 1) * (0.75 + this.random() * 0.45),
      rotation: this.random() * Math.PI * 2,
      angularVelocity: (this.random() < 0.5 ? -1 : 1) * (1.6 + this.random() * 2.4),
      size,
      startedAt: now,
      launchAt,
      until: launchAt + 1850,
    });
  }

  private pruneEffects(now: number): void {
    this.rewardSigns = this.rewardSigns.filter((sign) => now < sign.until);
    this.deathSparks = this.deathSparks.filter((spark) => now < spark.until);
    this.rewardMotes = this.rewardMotes.filter((mote) => now < mote.until);
  }

  private finishGame(now: number): void {
    if (this.status === "gameover") return;
    this.status = "gameover";
    this.gameOverAt = now;
    this.raiseHeld = false;
    this.raiseToRowBoundary = false;
    this.events.push({ type: "gameover" });
  }
}
