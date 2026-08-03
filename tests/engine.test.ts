import assert from "node:assert/strict";
import test from "node:test";

import {
  AWAKEN_FINAL_DELAY_MS,
  AWAKEN_INITIAL_DELAY_MS,
  AWAKEN_INTERNAL_DELAY_MS,
  BLOCK_CLEAR_DURATION_MS,
  BOARD_COLUMNS,
  CrackAttackEngine,
  DANGER_HIGH_ALERT_MS,
  DANGER_LOSS_DELAY_MS,
  LEVEL_LIGHT_FADE_MS,
  VISIBLE_ROWS,
  baseScoreFor,
  createEmptyBoard,
  findMatchCoordinates,
  findMatches,
  magnitudeAttacks,
  type AttackPayload,
  type Board,
  type BlockCell,
  type BlockFlavor,
  type Coordinate,
  type GameStatus,
  type GarbageCell,
  type MatchPattern,
} from "../app/game/engine.ts";

function block(id: number, flavor: BlockFlavor): BlockCell {
  return { id, kind: "block", flavor, state: "idle" };
}

function garbage(id: number, groupId: number): GarbageCell {
  return {
    id,
    kind: "garbage",
    groupId,
    flavor: "normal",
    texture: 0,
    state: "idle",
  };
}

interface EngineHarness {
  board: Board;
  status: GameStatus;
  phase: "idle" | "swapping" | "clearing" | "falling" | "garbage";
  chainDepth: number;
  chainBaseScore: number;
  resolvingChain: boolean;
  backgroundFallUntil: number;
  dangerMs: number;
  elapsedMs: number;
  lastUpdate: number;
  rise: number;
  score: number;
  startClear(
    matches: Coordinate[],
    chainStep: boolean,
    now: number,
    patterns?: MatchPattern[],
  ): void;
  resolveMatches(now: number, sharedSwapCause?: boolean): void;
  finishClear(now: number): void;
  random(): number;
  dropGarbage(
    attack: AttackPayload & { dropAt: number },
    now: number,
  ): boolean;
}

function harness(engine: CrackAttackEngine): EngineHarness {
  return engine as unknown as EngineHarness;
}

test("horizontal and vertical matches merge at a cross", () => {
  const board = createEmptyBoard();
  board[2][1] = block(1, 2);
  board[2][2] = block(2, 2);
  board[2][3] = block(3, 2);
  board[1][2] = block(4, 2);
  board[3][2] = block(5, 2);

  const matches = findMatchCoordinates(board);
  assert.equal(matches.length, 5);
  assert.deepEqual(
    new Set(matches.map(({ x, y }) => `${x}:${y}`)),
    new Set(["1:2", "2:2", "3:2", "2:1", "2:3"]),
  );
  assert.equal(findMatches(board).patterns.length, 1, "an intersecting cross is one elimination");
});

test("two triples made by one swap count as one six-block elimination", () => {
  const engine = new CrackAttackEngine({ seed: 0x363636 });
  const internals = harness(engine);
  const board = createEmptyBoard();

  for (let y = 0; y < 3; y += 1) {
    board[y][2] = block(100 + y, y === 1 ? 1 : 0);
    board[y][3] = block(110 + y, y === 1 ? 0 : 1);
  }
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  engine.setCursor(2, 1, 1000);
  assert.equal(engine.swap(1000), true);
  engine.update(1125);

  const snapshot = engine.getSnapshot(1125);
  assert.equal(snapshot.score, baseScoreFor(6));
  assert.deepEqual(
    engine.drainEvents()
      .filter((event) => event.type === "clear")
      .map((event) => event.magnitude),
    [6],
  );
  assert.deepEqual(
    snapshot.rewardSigns.map(({ kind, value }) => ({ kind, value })),
    [{ kind: "magnitude", value: 6 }],
  );
});

test("two lines of five made by one swap count as one ten-block elimination", () => {
  const engine = new CrackAttackEngine({ seed: 0x5a5a5a });
  const internals = harness(engine);
  const board = createEmptyBoard();

  for (let y = 0; y < 5; y += 1) {
    board[y][2] = block(120 + y, y === 2 ? 3 : 2);
    board[y][3] = block(130 + y, y === 2 ? 2 : 3);
  }
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  engine.setCursor(2, 2, 2000);
  assert.equal(engine.swap(2000), true);
  engine.update(2125);

  const snapshot = engine.getSnapshot(2125);
  assert.equal(snapshot.score, baseScoreFor(10));
  assert.deepEqual(
    engine.drainEvents()
      .filter((event) => event.type === "clear")
      .map((event) => event.magnitude),
    [10],
  );
  assert.deepEqual(
    snapshot.rewardSigns.map(({ kind, value }) => ({ kind, value })),
    [{ kind: "magnitude", value: 10 }],
  );
});

test("simultaneous unrelated landing matches remain separate causes", () => {
  const engine = new CrackAttackEngine({ seed: 0x606060 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  for (let x = 0; x < 3; x += 1) board[1][x] = block(140 + x, 0);
  for (let x = 3; x < 6; x += 1) board[3][x] = block(150 + x, 1);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  internals.resolveMatches(3000);

  const snapshot = engine.getSnapshot(3000);
  assert.equal(snapshot.score, baseScoreFor(3) * 2);
  assert.deepEqual(
    engine.drainEvents()
      .filter((event) => event.type === "clear")
      .map((event) => event.magnitude),
    [3, 3],
  );
  assert.equal(snapshot.rewardSigns.length, 0);
});

test("independent falling lines each advance the active combo and its score", () => {
  const engine = new CrackAttackEngine({ seed: 0x232323 });
  const internals = harness(engine);
  const initialBoard = createEmptyBoard();
  initialBoard[0][0] = block(1, 4);
  initialBoard[0][1] = block(2, 4);
  initialBoard[0][2] = block(3, 4);
  const initialMatches = findMatches(initialBoard);

  internals.board = initialBoard;
  internals.status = "playing";
  internals.phase = "idle";
  internals.startClear(
    initialMatches.coordinates,
    false,
    500,
    initialMatches.patterns,
  );
  const comboId = (initialBoard[0][0] as BlockCell).comboId;
  assert.notEqual(comboId, undefined);
  engine.drainEvents();

  const board = createEmptyBoard();
  for (let x = 0; x < 3; x += 1) {
    const cell = block(10 + x, 0);
    cell.comboId = comboId;
    board[1][x] = cell;
  }
  for (let x = 3; x < 6; x += 1) {
    const cell = block(10 + x, 2);
    cell.comboId = comboId;
    board[3][x] = cell;
  }
  assert.equal(findMatches(board).patterns.length, 2);

  internals.board = board;
  internals.phase = "idle";
  internals.resolveMatches(1000);

  const snapshot = engine.getSnapshot(1000);
  const events = engine.drainEvents();
  assert.equal(snapshot.chainDepth, 3, "two late patterns advance 1x through 2x to 3x");
  assert.equal(snapshot.score, 18, "each late triple is scored at its own combo depth");
  assert.deepEqual(
    events
      .filter((event) => event.type === "chain")
      .map((event) => event.depth),
    [2, 3],
  );
  assert.deepEqual(
    snapshot.rewardSigns
      .filter((sign) => sign.kind === "multiplier")
      .map((sign) => sign.value),
    [2, 3],
  );
  assert.equal(
    snapshot.rewardSigns.filter((sign) => sign.kind === "magnitude").length,
    0,
    "two causally linked triples do not also announce a magnitude-six clear",
  );
  assert.equal(
    snapshot.incomingCount,
    0,
    "the two triples do not generate magnitude-six garbage",
  );
  assert.deepEqual(
    events
      .filter((event) => event.type === "clear")
      .map((event) => event.magnitude),
    [3, 3],
    "each causal line keeps its own elimination magnitude",
  );
});

test("two late lines add two levels to an already-running higher combo", () => {
  const engine = new CrackAttackEngine({ seed: 0x454545 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  for (let x = 0; x < 3; x += 1) board[1][x] = block(30 + x, 1);
  for (let x = 3; x < 6; x += 1) board[4][x] = block(40 + x, 4);
  const matches = findMatches(board);

  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";
  internals.resolvingChain = true;
  internals.chainDepth = 4;
  internals.chainBaseScore = 10;
  internals.score = 20;
  internals.startClear(matches.coordinates, true, 2000, matches.patterns);

  const snapshot = engine.getSnapshot(2000);
  assert.equal(snapshot.chainDepth, 6);
  assert.equal(snapshot.score, 64);
  assert.deepEqual(
    snapshot.rewardSigns
      .filter((sign) => sign.kind === "multiplier")
      .map((sign) => sign.value),
    [5, 6],
  );
});

test("ordinary triples stay silent while larger clears use compact reward signs", () => {
  const tripleEngine = new CrackAttackEngine({ seed: 0x101010 });
  const tripleInternals = harness(tripleEngine);
  const tripleBoard = createEmptyBoard();
  for (let x = 0; x < 3; x += 1) tripleBoard[2][x] = block(60 + x, 3);
  const triple = findMatches(tripleBoard);
  tripleInternals.board = tripleBoard;
  tripleInternals.status = "playing";
  tripleInternals.phase = "idle";
  tripleInternals.startClear(triple.coordinates, false, 1000, triple.patterns);
  let snapshot = tripleEngine.getSnapshot(1000);
  assert.equal(snapshot.message, null);
  assert.equal(snapshot.rewardSigns.length, 0);

  tripleEngine.update(1000 + BLOCK_CLEAR_DURATION_MS - 1);
  snapshot = tripleEngine.getSnapshot(1000 + BLOCK_CLEAR_DURATION_MS - 1);
  assert.equal(snapshot.deathSparks.length, 0, "blocks remain visible for all 90 original ticks");

  tripleEngine.update(1000 + BLOCK_CLEAR_DURATION_MS);
  snapshot = tripleEngine.getSnapshot(1000 + BLOCK_CLEAR_DURATION_MS);
  assert.equal(snapshot.deathSparks.length, 9, "each of the three blocks becomes three stars");

  const fourEngine = new CrackAttackEngine({ seed: 0x202020 });
  const fourInternals = harness(fourEngine);
  const fourBoard = createEmptyBoard();
  for (let x = 0; x < 4; x += 1) fourBoard[2][x] = block(70 + x, 0);
  const four = findMatches(fourBoard);
  fourInternals.board = fourBoard;
  fourInternals.status = "playing";
  fourInternals.phase = "idle";
  fourInternals.startClear(four.coordinates, false, 1000, four.patterns);
  snapshot = fourEngine.getSnapshot(1000);
  assert.equal(snapshot.message, null);
  assert.deepEqual(
    snapshot.rewardSigns.map(({ kind, value }) => ({ kind, value })),
    [{ kind: "magnitude", value: 4 }],
  );
  assert.equal(snapshot.rewardMotes.length, 1, "generated garbage starts as a reward star");
  assert.equal(snapshot.incomingCount, 1);
  fourEngine.update(2500);
  snapshot = fourEngine.getSnapshot(2500);
  assert.equal(snapshot.incomingCount, 1, "the reward star travels before its garbage drops");
  assert.equal(snapshot.rewardMotes.length, 1);
});

test("solo scoring preserves the original three-block and gray values", () => {
  assert.equal(baseScoreFor(3), 2);
  assert.equal(baseScoreFor(4), 4);
  assert.equal(baseScoreFor(3, true), 6);
  assert.equal(baseScoreFor(5, true), 15);
});

test("a simultaneous gray line supersedes colored points like the original", () => {
  const engine = new CrackAttackEngine({ seed: 0x606165 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  for (let x = 0; x < 3; x += 1) board[1][x] = block(700 + x, 1);
  for (let x = 3; x < 6; x += 1) board[3][x] = block(710 + x, 5);
  const matches = findMatches(board);

  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";
  internals.startClear(matches.coordinates, false, 1000, matches.patterns);

  assert.equal(
    engine.getSnapshot(1000).score,
    baseScoreFor(3, true),
    "Score::reportElimination ignores the colored magnitude when gray is present",
  );
});

test("the initial stack never starts with equal orthogonal neighbors", () => {
  const board = new CrackAttackEngine({ seed: 1 }).getSnapshot(0).board;

  for (let y = 0; y < VISIBLE_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      const cell = board[y][x];
      if (cell?.kind !== "block") continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const neighbor = board[y + dy]?.[x + dx];
        if (neighbor?.kind !== "block") continue;
        assert.notEqual(
          cell.flavor,
          neighbor.flavor,
          `initial neighbors at ${x},${y} and ${x + dx},${y + dy} differ`,
        );
      }
    }
  }
});

test("an ordinary swap does not pause the upward creep", () => {
  const engine = new CrackAttackEngine({ seed: 0x515253 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  board[0][2] = block(800, 2);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";
  internals.elapsedMs = 0;
  internals.lastUpdate = 1000;
  internals.rise = 0.25;

  engine.setCursor(2, 0, 1000);
  assert.equal(engine.swap(1000), true);
  engine.update(1020);

  assert.ok(
    engine.getSnapshot(1020).rise > 0.25,
    "Creep::timeStep keeps running while Swapper::timeStep animates",
  );
});

test("a creep rollover carries an active swap without a visual jump", () => {
  const engine = new CrackAttackEngine({ seed: 0x545556 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  board[0][2] = block(850, 2);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";
  internals.elapsedMs = 0;
  internals.lastUpdate = 1000;
  internals.rise = 0.9999;

  engine.setCursor(2, 0, 1000);
  assert.equal(engine.swap(1000), true);
  engine.update(1020);

  const snapshot = engine.getSnapshot(1020);
  const moving = snapshot.board[1][3] as BlockCell;
  assert.equal(moving.id, 850, "the logical swap target rises with the board");
  assert.equal(
    moving.animationFromY,
    1,
    "the interpolation origin rises too, preserving the rendered position",
  );
  assert.equal(snapshot.phase, "swapping");
});

test("falling alone does not pause the game-over clock", () => {
  const engine = new CrackAttackEngine({ seed: 0x616263 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  for (let y = 0; y < VISIBLE_ROWS; y += 1) {
    board[y][BOARD_COLUMNS - 1] = block(900 + y, (y % 2) as BlockFlavor);
  }
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";
  internals.backgroundFallUntil = 2000;
  internals.dangerMs = 1000;
  internals.lastUpdate = 1000;

  engine.update(1020);
  assert.equal(
    engine.getSnapshot(1020).dangerMs,
    1020,
    "only dying or awakening pieces freeze Creep::loss_alarm",
  );
});

test("a slow frame catches up all original simulation time", () => {
  const engine = new CrackAttackEngine({ seed: 0x717273 });
  const internals = harness(engine);
  internals.board = createEmptyBoard();
  internals.status = "playing";
  internals.phase = "idle";
  internals.elapsedMs = 0;
  internals.lastUpdate = 1000;
  internals.rise = 0;

  engine.update(1200);
  const snapshot = engine.getSnapshot(1200);
  assert.equal(snapshot.elapsedMs, 200);
  assert.ok(Math.abs(snapshot.rise - (20 / 1440) * 0.2) < 1e-9);
});

test("occupied level lights fade from blue through purple on the original cadence", () => {
  const engine = new CrackAttackEngine({ seed: 0x565656 });
  const ready = engine.getSnapshot(0);
  assert.ok(ready.levelLightBlends.every((blend) => blend === 0));

  engine.start(100);
  const halfway = engine.getSnapshot(100 + LEVEL_LIGHT_FADE_MS / 2);
  assert.ok(halfway.topOccupiedRow >= 0);
  assert.equal(halfway.levelLightBlends[0], 0.5);
  assert.equal(halfway.levelLightBlends[halfway.topOccupiedRow], 0.5);
  assert.equal(halfway.levelLightBlends[halfway.topOccupiedRow + 1] ?? 0, 0);

  engine.update(100 + LEVEL_LIGHT_FADE_MS);
  const complete = engine.getSnapshot(100 + LEVEL_LIGHT_FADE_MS);
  assert.equal(complete.levelLightBlends[0], 1);
  assert.equal(complete.levelLightBlends[complete.topOccupiedRow], 1);
});

test("a breaking line restores the original one-second danger grace", () => {
  const engine = new CrackAttackEngine({ seed: 0xdadada });
  const internals = harness(engine);
  const board = createEmptyBoard();

  // Keep the stack over the safe-height boundary after the unrelated triple
  // disappears, so the danger timer has to resume instead of clearing.
  for (let y = 0; y < VISIBLE_ROWS; y += 1) {
    board[y][BOARD_COLUMNS - 1] = block(300 + y, (y % 2) as BlockFlavor);
  }
  for (let x = 0; x < 3; x += 1) board[0][x] = block(400 + x, 3);

  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";
  internals.dangerMs = DANGER_LOSS_DELAY_MS - 250;
  internals.lastUpdate = 1000;
  internals.startClear([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], false, 1000);

  engine.update(1020);
  let snapshot = engine.getSnapshot(1020);
  assert.equal(snapshot.status, "playing");
  assert.equal(
    snapshot.dangerMs,
    DANGER_HIGH_ALERT_MS,
    "breaking blocks pull a red loss clock back to the purple/red boundary",
  );

  engine.update(1000 + BLOCK_CLEAR_DURATION_MS);
  snapshot = engine.getSnapshot(1000 + BLOCK_CLEAR_DURATION_MS);
  assert.equal(snapshot.status, "playing");
  assert.equal(
    snapshot.dangerMs,
    DANGER_HIGH_ALERT_MS + 20,
    "the clock resumes from the restored grace after the last dying block is gone",
  );
});

test("garbage awakening restores danger grace without moving an earlier warning", () => {
  const engine = new CrackAttackEngine({ seed: 0xbababa });
  const internals = harness(engine);
  const board = createEmptyBoard();

  for (let y = 0; y < VISIBLE_ROWS; y += 1) {
    board[y][BOARD_COLUMNS - 1] = block(500 + y, (y % 2) as BlockFlavor);
  }
  const awakeningGarbage = garbage(600, 60);
  awakeningGarbage.state = "awakening";
  awakeningGarbage.awakenRevealAt = 1000;
  awakeningGarbage.awakenReleaseAt = 5000;
  board[2][0] = awakeningGarbage;

  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";
  internals.lastUpdate = 1000;
  internals.dangerMs = DANGER_HIGH_ALERT_MS - 500;
  engine.update(1020);
  assert.equal(
    engine.getSnapshot(1020).dangerMs,
    DANGER_HIGH_ALERT_MS - 500,
    "the original only resets a clock that has entered high alert",
  );

  internals.dangerMs = DANGER_LOSS_DELAY_MS - 100;
  engine.update(1040);
  assert.equal(
    engine.getSnapshot(1040).dangerMs,
    DANGER_HIGH_ALERT_MS,
    "the garbage reveal restores the full one-second loss grace",
  );
});

test("large clears are converted into bounded garbage pieces", () => {
  assert.deepEqual(
    magnitudeAttacks(4, 100).map(({ height, width }) => [height, width]),
    [[1, 3]],
  );
  assert.deepEqual(
    magnitudeAttacks(8, 100).map(({ height, width }) => [height, width]),
    [[1, 4], [1, 4]],
  );
  assert.ok(magnitudeAttacks(14, 100).every(({ width }) => width <= BOARD_COLUMNS));
});

test("a legal one-move clear advances the live simulation and awards points", () => {
  let selected:
    | { engine: CrackAttackEngine; x: number; y: number }
    | undefined;

  for (let seed = 1; seed <= 300 && !selected; seed += 1) {
    const engine = new CrackAttackEngine({ seed });
    const snapshot = engine.getSnapshot(0);
    for (let y = 0; y < 9 && !selected; y += 1) {
      for (let x = 0; x < BOARD_COLUMNS - 1 && !selected; x += 1) {
        const board = snapshot.board.map((row) => [...row]);
        [board[y][x], board[y][x + 1]] = [board[y][x + 1], board[y][x]];
        if (findMatchCoordinates(board).length > 0) selected = { engine, x, y };
      }
    }
  }

  assert.ok(selected, "expected a deterministic seed with a one-swap clear");
  selected.engine.start(100);
  selected.engine.update(3000);
  selected.engine.setCursor(selected.x, selected.y);
  assert.equal(selected.engine.swap(3100), true);
  selected.engine.update(3300);
  assert.ok(selected.engine.getSnapshot(3300).score > 0);
});

test("idle blocks remain swappable while another line is breaking", () => {
  const engine = new CrackAttackEngine({ seed: 0x717171 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  board[0][0] = block(300, 0);
  board[0][1] = block(301, 0);
  board[0][2] = block(302, 0);
  board[0][3] = block(303, 1);
  board[0][4] = block(304, 2);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  internals.startClear(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    false,
    1000,
  );
  engine.setCursor(3, 0, 1040);
  assert.equal(engine.swap(1050), true, "unaffected blocks can swap during the clear");

  let snapshot = engine.getSnapshot(1100);
  assert.equal(snapshot.phase, "clearing", "the breaking line keeps its own timer");
  assert.equal((snapshot.board[0][3] as BlockCell).id, 304);
  assert.equal((snapshot.board[0][4] as BlockCell).id, 303);
  assert.ok(snapshot.swapProgress > 0 && snapshot.swapProgress < 1);
  assert.equal(engine.swap(1100), false, "a second swap waits for the first movement to finish");

  engine.setCursor(0, 0, 1180);
  assert.equal(engine.swap(1180), false, "the blocks that are actually breaking stay immutable");
  engine.setCursor(3, 0, 1180);
  assert.equal(engine.swap(1180), true, "another mid-clear swap is accepted after the swap delay");
  snapshot = engine.getSnapshot(1180);
  assert.equal(snapshot.phase, "clearing");
});

test("an unrelated line starts breaking immediately without joining an active combo", () => {
  const engine = new CrackAttackEngine({ seed: 0x737373 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  board[0][0] = block(600, 0);
  board[0][1] = block(601, 0);
  board[0][2] = block(602, 0);
  board[0][3] = block(603, 2);
  board[0][4] = block(604, 3);
  board[0][5] = block(605, 4);
  board[1][2] = block(606, 3);
  board[1][3] = block(607, 4);
  board[1][4] = block(608, 2);
  board[1][5] = block(609, 3);
  board[2][2] = block(610, 1);
  board[2][3] = block(611, 2);
  board[2][4] = block(612, 1);
  board[2][5] = block(613, 1);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  internals.startClear(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    false,
    1000,
  );
  engine.drainEvents();
  engine.setCursor(2, 2, 1040);
  assert.equal(engine.swap(1050), true);

  engine.update(1175);
  let snapshot = engine.getSnapshot(1175);
  assert.equal((snapshot.board[2][3] as BlockCell).state, "clearing");
  assert.equal((snapshot.board[2][3] as BlockCell).clearStarted, 1175);
  assert.equal((snapshot.board[0][0] as BlockCell).state, "clearing");
  assert.equal(snapshot.score, 4);
  assert.equal(
    engine.drainEvents().filter((event) => event.type === "chain").length,
    0,
    "overlapping animation time alone does not create a combo",
  );

  engine.update(1000 + BLOCK_CLEAR_DURATION_MS);
  snapshot = engine.getSnapshot(1000 + BLOCK_CLEAR_DURATION_MS);
  assert.equal(snapshot.board[0][0], null, "the earlier line finishes on its own timer");
  assert.equal(
    (snapshot.board[2][3] as BlockCell).state,
    "clearing",
    "the later line keeps breaking on its independent timer",
  );
});

test("ordinary blocks remain swappable while incoming garbage appears", () => {
  const engine = new CrackAttackEngine({ seed: 0x818181 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  board[0][0] = block(400, 1);
  board[0][1] = block(401, 3);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  assert.equal(internals.dropGarbage({
    height: 1,
    width: BOARD_COLUMNS,
    flavor: "normal",
    source: "clear",
    createdAt: 1000,
    dropAt: 1000,
  }, 1000), true);
  assert.equal(engine.getSnapshot(1000).phase, "garbage");

  engine.setCursor(0, 0, 1010);
  assert.equal(engine.swap(1020), true, "the falling garbage does not lock the swapper");
  let snapshot = engine.getSnapshot(1080);
  assert.equal(snapshot.phase, "garbage", "garbage keeps its independent drop animation");
  assert.ok(snapshot.swapProgress > 0 && snapshot.swapProgress < 1);
  assert.equal((snapshot.board[0][0] as BlockCell).id, 401);
  assert.equal((snapshot.board[0][1] as BlockCell).id, 400);

  engine.update(1145);
  snapshot = engine.getSnapshot(1145);
  assert.equal(snapshot.phase, "garbage");
  assert.equal(snapshot.swapProgress, 0);
});

test("a block swapped over a hole falls before an unrelated clear finishes", () => {
  const engine = new CrackAttackEngine({ seed: 0x919191 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  board[0][0] = block(500, 0);
  board[0][1] = block(501, 0);
  board[0][2] = block(502, 0);
  board[0][4] = block(503, 2);
  board[1][4] = block(504, 4);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  internals.startClear(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    false,
    1000,
  );
  engine.setCursor(4, 1, 1020);
  assert.equal(engine.swap(1050), true);

  let snapshot = engine.getSnapshot(1174);
  assert.equal((snapshot.board[1][5] as BlockCell).id, 504);
  assert.equal(snapshot.board[0][5], null, "the block completes its horizontal slide first");

  engine.update(1175);
  snapshot = engine.getSnapshot(1175);
  const falling = snapshot.board[0][5] as BlockCell;
  assert.equal(snapshot.phase, "clearing", "the unrelated breaking line keeps running");
  assert.equal(falling.id, 504);
  assert.equal(snapshot.board[1][5], null);
  assert.equal(falling.animationFromY, 1, "vertical motion starts as soon as the swap ends");
  assert.equal(falling.animationStarted, 1175);
  assert.equal(falling.animationDelay, 60, "a new fall keeps the original three-tick hang");
  assert.equal(falling.animationDuration, 120, "a one-row fall takes 60ms after the hang");
});

test("a quick swap can fill a falling stack's path and create a combo", () => {
  const engine = new CrackAttackEngine({ seed: 0xa1a1a1 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  board[0][2] = block(520, 0);
  board[1][2] = block(521, 0);
  board[2][2] = block(522, 0);
  board[3][2] = block(523, 1);
  board[4][2] = block(524, 1);
  board[0][3] = block(525, 1);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  internals.startClear(
    [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    false,
    1000,
  );
  engine.drainEvents();
  engine.update(1000 + BLOCK_CLEAR_DURATION_MS);

  let snapshot = engine.getSnapshot(2820);
  assert.equal((snapshot.board[0][2] as BlockCell).id, 523);
  assert.equal((snapshot.board[1][2] as BlockCell).id, 524);
  assert.ok(
    (snapshot.board[0][2] as BlockCell).animationFromY! > 0,
    "the lower green block is still visibly falling from above",
  );

  engine.setCursor(2, 0, 2810);
  assert.equal(
    engine.swap(2820),
    true,
    "the adjacent green block can enter the reserved landing cell",
  );
  snapshot = engine.getSnapshot(2820);
  assert.equal((snapshot.board[0][2] as BlockCell).id, 525);
  assert.equal((snapshot.board[1][2] as BlockCell).id, 523);
  assert.equal((snapshot.board[2][2] as BlockCell).id, 524);
  assert.equal(snapshot.board[0][3], null);

  engine.update(2944);
  snapshot = engine.getSnapshot(2944);
  assert.equal((snapshot.board[0][2] as BlockCell).state, "idle");
  assert.equal(
    engine.drainEvents().filter((event) => event.type === "chain").length,
    0,
    "the line waits for the falling blocks to land",
  );

  engine.update(2945);
  snapshot = engine.getSnapshot(2945);
  assert.equal((snapshot.board[0][2] as BlockCell).state, "clearing");
  assert.equal((snapshot.board[1][2] as BlockCell).state, "clearing");
  assert.equal((snapshot.board[2][2] as BlockCell).state, "clearing");
  assert.equal(snapshot.chainDepth, 2);
  assert.equal(snapshot.score, 8);
  assert.deepEqual(
    engine.drainEvents()
      .filter((event) => event.type === "chain")
      .map((event) => event.depth),
    [2],
  );
});

test("a support change retargets an in-flight block without a visual jump", () => {
  const engine = new CrackAttackEngine({ seed: 0xb2b2b2 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  const support = block(530, 0);
  const falling = block(531, 2);
  falling.animationFromX = 2;
  falling.animationFromY = 4;
  falling.animationStarted = 1000;
  falling.animationDuration = 240;
  falling.animationDelay = 0;
  board[0][2] = support;
  board[1][2] = falling;
  internals.board = board;
  internals.status = "playing";
  internals.phase = "falling";
  internals.backgroundFallUntil = 1240;

  engine.setCursor(2, 0, 1050);
  assert.equal(engine.swap(1060), true);
  engine.update(1185);

  const snapshot = engine.getSnapshot(1185);
  const retargeted = snapshot.board[0][2] as BlockCell;
  assert.equal(retargeted.id, 531);
  assert.equal(retargeted.animationStarted, 1185);
  assert.equal(retargeted.animationDelay, 0, "an existing fall does not hang a second time");
  assert.ok(
    Math.abs((retargeted.animationFromY ?? 0) - 1.6875) < 1e-9,
    "the new motion begins at the block's exact visible position",
  );
  assert.ok(
    Math.abs((retargeted.animationDuration ?? 0) - 101.25) < 1e-9,
    "remaining fall time is proportional to the remaining distance",
  );
});

test("the attack boundary can receive and drop future multiplayer payloads", () => {
  const engine = new CrackAttackEngine({ seed: 42 });
  engine.start(100);
  engine.update(3000);
  engine.receiveAttack({
    height: 1,
    width: 4,
    flavor: "normal",
    source: "clear",
    createdAt: 3000,
  });
  assert.equal(engine.getSnapshot(3000).incomingCount, 1);
  engine.update(10000);
  const snapshot = engine.getSnapshot(10000);
  assert.equal(snapshot.incomingCount, 0);
  assert.ok(snapshot.board.some((row) => row.some((cell) => cell?.kind === "garbage")));
});

test("holding raise advances complete rows and carries the cursor upward", () => {
  const engine = new CrackAttackEngine({ seed: 7 });
  engine.start(100);
  engine.update(3000);
  const initialCursor = engine.getSnapshot(3000).cursorY;
  engine.setRaiseHeld(true);
  let previousVisualRow = initialCursor;
  for (let now = 3020; now <= 3820; now += 20) {
    engine.update(now);
    const frame = engine.getSnapshot(now);
    const visualRow = frame.cursorRenderY + frame.rise;
    assert.ok(
      visualRow >= previousVisualRow - 1e-9,
      "a creep rollover never leaves the cursor sliding behind the stack",
    );
    assert.ok(visualRow - previousVisualRow < 0.2, "the cursor remains continuous at rollover");
    previousVisualRow = visualRow;
  }
  const raised = engine.getSnapshot(3820);
  assert.ok(raised.cursorY > initialCursor);
  assert.ok(raised.rise < 1);
});

test("a quick raise tap commits the stack to the next complete row", () => {
  const engine = new CrackAttackEngine({ seed: 11 });
  engine.start(100);
  engine.update(3000);
  engine.update(3050);

  const before = engine.getSnapshot(3050);
  assert.ok(before.rise > 0 && before.rise < 1, "normal creep has a fractional offset");

  engine.setRaiseHeld(true);
  engine.setRaiseHeld(false);

  let now = 3050;
  let after = before;
  while (after.cursorY === before.cursorY && now < 4050) {
    now += 20;
    engine.update(now);
    after = engine.getSnapshot(now);
  }

  assert.equal(after.cursorY, before.cursorY + 1, "the tap advances exactly one logical row");
  assert.equal(after.rise, 0, "the committed raise stops exactly on the row boundary");

  engine.update(now + 20);
  assert.ok(
    engine.getSnapshot(now + 20).rise < 0.01,
    "ordinary slow creep resumes after the committed row",
  );
});

test("cursor movement glides with the original quadratic timing", () => {
  const engine = new CrackAttackEngine({ seed: 17 });
  engine.start(100);
  engine.update(3000);

  engine.moveCursor(1, 0, 3000);
  let snapshot = engine.getSnapshot(3000);
  assert.equal(snapshot.cursorX, 3, "the logical selection updates immediately");
  assert.equal(snapshot.cursorRenderX, 2, "the rendered cursor begins at its old position");

  snapshot = engine.getSnapshot(3060);
  assert.ok(snapshot.cursorRenderX > 2 && snapshot.cursorRenderX < 3);
  assert.equal(snapshot.cursorRenderX, 2.75);

  snapshot = engine.getSnapshot(3120);
  assert.equal(snapshot.cursorRenderX, 3);
  assert.equal(snapshot.cursorRenderY, 4);
});

test("the cursor moves during the opening countdown while swapping stays locked", () => {
  const engine = new CrackAttackEngine({ seed: 18 });
  engine.start(100);

  engine.moveCursor(-1, 0, 200);
  let snapshot = engine.getSnapshot(200);
  assert.equal(snapshot.status, "countdown");
  assert.equal(snapshot.cursorX, 1, "countdown input updates the logical cursor");
  assert.equal(snapshot.cursorRenderX, 2, "the countdown cursor still begins its normal glide");
  assert.equal(engine.swap(200), false, "blocks cannot be swapped before play starts");

  snapshot = engine.getSnapshot(260);
  assert.ok(snapshot.cursorRenderX < 2 && snapshot.cursorRenderX > 1);
});

test("garbage reveals bottom-to-top and left-to-right on the original cadence", () => {
  const engine = new CrackAttackEngine({ seed: 0xabc123 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  board[2][0] = garbage(100, 50);
  board[2][1] = garbage(101, 50);
  board[3][0] = garbage(102, 50);
  board[3][1] = garbage(103, 50);
  board[2][2] = block(104, 1);
  board[2][3] = block(105, 1);
  board[2][4] = block(106, 1);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  const clearStarted = 1000;
  internals.startClear([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }], false, clearStarted);
  const plannedFlavors = [
    (board[2][0] as GarbageCell).shatterTargetFlavor,
    (board[2][1] as GarbageCell).shatterTargetFlavor,
    (board[3][0] as GarbageCell).shatterTargetFlavor,
    (board[3][1] as GarbageCell).shatterTargetFlavor,
  ];
  assert.ok(
    plannedFlavors.every((flavor) => flavor !== undefined),
    "the inner cubes know their final colors while the shell unwraps",
  );
  const firstRevealAt = clearStarted + AWAKEN_INITIAL_DELAY_MS;
  engine.update(firstRevealAt);

  const awakening = engine.getSnapshot(firstRevealAt).board
    .flatMap((row, y) => row.map((cell, x) => ({ cell, x, y })))
    .filter(({ cell }) => cell?.kind === "block" && cell.state === "awakening")
    .sort((a, b) => a.y - b.y || a.x - b.x);

  assert.equal(awakening.length, 4);
  assert.deepEqual(awakening.map(({ x, y }) => [x, y]), [[0, 2], [1, 2], [0, 3], [1, 3]]);
  assert.deepEqual(
    awakening.map(({ cell }) => (cell as BlockCell).flavor),
    plannedFlavors,
    "the first revealed colors continue the hidden 3D pop animation",
  );
  assert.deepEqual(
    awakening.map(({ cell }) => (cell as BlockCell).awakenRevealAt),
    [
      clearStarted + AWAKEN_INITIAL_DELAY_MS,
      clearStarted + AWAKEN_INITIAL_DELAY_MS + AWAKEN_INTERNAL_DELAY_MS,
      clearStarted + AWAKEN_INITIAL_DELAY_MS + AWAKEN_INTERNAL_DELAY_MS * 2,
      clearStarted + AWAKEN_INITIAL_DELAY_MS + AWAKEN_INTERNAL_DELAY_MS * 3,
    ],
  );
  const releaseAt = clearStarted
    + AWAKEN_INITIAL_DELAY_MS
    + AWAKEN_INTERNAL_DELAY_MS * 3
    + AWAKEN_FINAL_DELAY_MS;
  assert.ok(awakening.every(({ cell }) => (cell as BlockCell).awakenReleaseAt === releaseAt));
  assert.equal(findMatchCoordinates(engine.getSnapshot(firstRevealAt).board).length, 0);
});

test("alternating full-width garbage rows sometimes reform instead of becoming blocks", () => {
  const engine = new CrackAttackEngine({ seed: 0x999999 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  let id = 700;
  for (let y = 2; y <= 3; y += 1) {
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      const cell = garbage(id++, 80);
      cell.state = "shattering";
      cell.clearStarted = 1000;
      cell.clearUntil = 1000 + AWAKEN_INITIAL_DELAY_MS;
      board[y][x] = cell;
    }
  }
  internals.board = board;
  internals.status = "playing";
  internals.phase = "clearing";
  internals.random = () => 0.1;

  internals.finishClear(1000 + AWAKEN_INITIAL_DELAY_MS);
  const snapshot = engine.getSnapshot(1000 + AWAKEN_INITIAL_DELAY_MS);
  assert.ok(
    snapshot.board[2].every((cell) => cell?.kind === "block" && cell.state === "awakening"),
    "the first row becomes colored blocks",
  );
  assert.ok(
    snapshot.board[3].every((cell) => cell?.kind === "garbage" && cell.state === "awakening"),
    "the alternating row enters the original reforming-garbage state",
  );
  assert.equal(
    new Set(snapshot.board[3].map((cell) => (cell as GarbageCell).groupId)).size,
    1,
    "the unfinished row remains one full-width garbage piece",
  );
  assert.ok(
    snapshot.board[3].every((cell) => (
      (cell as GarbageCell).awakenSource === "normal"
    )),
    "the retained row remembers the old shell color for its section-pop animation",
  );
});

test("the awakening preview stays fixed, permits planning swaps, then creates a chain", () => {
  const engine = new CrackAttackEngine({ seed: 0x515151 });
  const internals = harness(engine);
  const board = createEmptyBoard();
  board[0][0] = block(200, 4);
  board[1][0] = block(201, 4);
  board[2][0] = garbage(202, 60);
  board[2][1] = block(203, 2);
  board[2][2] = block(204, 2);
  board[2][3] = block(205, 2);
  board[0][4] = block(206, 0);
  board[0][5] = block(207, 1);
  internals.board = board;
  internals.status = "playing";
  internals.phase = "idle";

  internals.startClear([{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }], false, 1000);
  engine.update(2300);
  let snapshot = engine.getSnapshot(2300);
  const preview = snapshot.board[2][0] as BlockCell;
  assert.equal(preview.state, "awakening");
  assert.equal(preview.awakenRevealAt, 2300);
  assert.equal(preview.awakenReleaseAt, 3300);

  const riseBefore = snapshot.rise;
  engine.setCursor(4, 0);
  assert.equal(engine.swap(2400), true, "ordinary blocks remain swappable during the preview");
  engine.update(2600);
  snapshot = engine.getSnapshot(2600);
  assert.equal(snapshot.rise, riseBefore, "the stack does not rise during awakening");
  assert.equal((snapshot.board[2][0] as BlockCell).state, "awakening");

  assert.ok(engine.drainEvents().some((event) => event.type === "awaken"));

  (snapshot.board[0][0] as BlockCell).flavor = preview.flavor;
  (snapshot.board[1][0] as BlockCell).flavor = preview.flavor;
  engine.update(3299);
  assert.equal((engine.getSnapshot(3299).board[2][0] as BlockCell).state, "awakening");

  engine.update(3300);
  snapshot = engine.getSnapshot(3300);
  assert.equal((snapshot.board[2][0] as BlockCell).state, "clearing");
  assert.equal(snapshot.phase, "clearing");
  assert.equal(snapshot.chainDepth, 2);
  assert.ok(engine.drainEvents().some((event) => event.type === "chain" && event.depth === 2));
});
