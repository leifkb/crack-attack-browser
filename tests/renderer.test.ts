import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  calculateWorldView,
  projectWorldPoint,
  screenCenterToWorld,
} from "../app/game/worldView.ts";
import {
  creepRowBlockMaterial,
  countdownVisual,
  createGarbageMesh,
  doubleTriangularFlash,
  formatSoloScore,
  gameOverMaskBounds,
  gameOverCenterY,
  garbageShatterVisual,
  levelLightColor,
  levelLightScreenY,
  loseBarToneAt,
  loseBarVisual,
  messagePulseAlpha,
  playfieldVisible,
  retainedGarbageVisual,
} from "../app/game/renderGeometry.ts";
import { scoreToBeat } from "../app/game/highScore.ts";

const CELL_SIZE = 62;
const BOARD_X = 340;
const BOARD_TOP = 38;
const BOARD_WIDTH = 372;
const BOARD_HEIGHT = 12 * CELL_SIZE;
const BOARD_BOTTOM = 782;
const VIEW_CENTER_X = BOARD_X + BOARD_WIDTH / 2;
const VIEW_CENTER_Y = BOARD_BOTTOM - 4 * CELL_SIZE;
const WORLD_UNITS_PER_PIXEL = 2 / CELL_SIZE;

const blockObj = readFileSync(
  new URL("../public/crack-attack-assets/block.obj", import.meta.url),
  "utf8",
);

function viewAt(x: number, y: number) {
  return calculateWorldView(
    x,
    y,
    VIEW_CENTER_X,
    VIEW_CENTER_Y,
    WORLD_UNITS_PER_PIXEL,
  );
}

test("block camera and point light vary continuously across the shared world", () => {
  const centerX = BOARD_X + BOARD_WIDTH / 2;
  const lower = viewAt(centerX, BOARD_BOTTOM - CELL_SIZE / 2);
  const upper = viewAt(centerX, BOARD_BOTTOM - CELL_SIZE * 8.5);
  const onePixelHigher = viewAt(centerX, BOARD_BOTTOM - CELL_SIZE / 2 - 1);

  assert.ok(lower.pitch > 0, "lower blocks expose their top side");
  assert.ok(upper.pitch < 0, "higher blocks expose their bottom side");
  assert.ok(onePixelHigher.pitch < lower.pitch, "the camera angle changes continuously during rise");
  assert.ok(lower.lightPosition[1] > upper.lightPosition[1]);
});

test("the hidden creep row uses an opaque quarter-strength diffuse material", () => {
  const yellow = creepRowBlockMaterial([0.85, 0.85, 0]);

  assert.deepEqual(yellow.color, [0.2125, 0.2125, 0]);
  assert.equal(
    yellow.alpha,
    1,
    "opaque geometry keeps neighboring faces from blending into glowing seams",
  );
});

test("the fixed light illuminates opposite sides across the board", () => {
  const centerY = BOARD_BOTTOM - CELL_SIZE * 4;
  const left = viewAt(BOARD_X + CELL_SIZE / 2, centerY);
  const right = viewAt(BOARD_X + BOARD_WIDTH - CELL_SIZE / 2, centerY);

  assert.ok(left.yaw < 0);
  assert.ok(right.yaw > 0);
  assert.ok(left.lightPosition[0] > 0);
  assert.ok(right.lightPosition[0] < 0);
});

test("the original shared projection exposes opposite horizontal faces above and below the camera", () => {
  const centerX = VIEW_CENTER_X;
  const lowerCenter = screenCenterToWorld(
    centerX,
    BOARD_BOTTOM - CELL_SIZE / 2,
    VIEW_CENTER_X,
    VIEW_CENTER_Y,
    WORLD_UNITS_PER_PIXEL,
  );
  const upperCenter = screenCenterToWorld(
    centerX,
    BOARD_BOTTOM - CELL_SIZE * 9.5,
    VIEW_CENTER_X,
    VIEW_CENTER_Y,
    WORLD_UNITS_PER_PIXEL,
  );

  const lowerTopFront = projectWorldPoint(
    [lowerCenter[0], lowerCenter[1] + 0.9, lowerCenter[2] + 0.9],
    VIEW_CENTER_X,
    VIEW_CENTER_Y,
    WORLD_UNITS_PER_PIXEL,
  );
  const lowerTopBack = projectWorldPoint(
    [lowerCenter[0], lowerCenter[1] + 0.9, lowerCenter[2] - 0.9],
    VIEW_CENTER_X,
    VIEW_CENTER_Y,
    WORLD_UNITS_PER_PIXEL,
  );
  const upperBottomFront = projectWorldPoint(
    [upperCenter[0], upperCenter[1] - 0.9, upperCenter[2] + 0.9],
    VIEW_CENTER_X,
    VIEW_CENTER_Y,
    WORLD_UNITS_PER_PIXEL,
  );
  const upperBottomBack = projectWorldPoint(
    [upperCenter[0], upperCenter[1] - 0.9, upperCenter[2] - 0.9],
    VIEW_CENTER_X,
    VIEW_CENTER_Y,
    WORLD_UNITS_PER_PIXEL,
  );

  assert.ok(lowerTopFront[1] > lowerTopBack[1], "the low block has a visible top face");
  assert.ok(upperBottomFront[1] < upperBottomBack[1], "the high block has a visible underside");
  assert.ok(Math.abs(lowerTopFront[1] - lowerTopBack[1]) > 5);
  assert.ok(Math.abs(upperBottomFront[1] - upperBottomBack[1]) > 5);
});

test("the block asset keeps the original high-detail folds and beveled edges", () => {
  const vertices = blockObj
    .split("\n")
    .filter((line) => line.startsWith("v "))
    .map((line) => line.trim().split(/\s+/).slice(1).map(Number));
  const faces = blockObj
    .split("\n")
    .filter((line) => line.startsWith("f "))
    .map((line) => line.trim().split(/\s+/).slice(1)
      .map((entry) => Number(entry.split("/")[0])));

  assert.equal(vertices.length, 504, "the full original high-resolution geometry is present");
  assert.equal(faces.length, 168, "the full set of folded and beveled triangles is present");
  assert.ok(
    faces.every((face) => face.length === 3),
    "the browser mesh loader receives only triangles",
  );
  assert.ok(
    vertices.some((vertex) => vertex.every((axis) => Math.abs(axis) === 0.8)),
    "the inset cube corners create the original beveled border",
  );
  assert.ok(
    vertices.some((vertex) =>
      vertex.filter((axis) => Math.abs(axis) === 0.986824).length === 1
      && vertex.filter((axis) => Math.abs(axis) === 0.111631).length === 1),
    "the raised inner ridges preserve the characteristic X fold",
  );
});

test("level lights preserve occupancy color through danger and row-impact flashes", () => {
  const empty = levelLightColor(false, -1);
  const occupied = levelLightColor(true, -1);
  const halfway = levelLightColor(0.5, -1);
  const dangerEmpty = levelLightColor(false, 12);
  const dangerOccupied = levelLightColor(true, 12);
  const dangerWhite = levelLightColor(false, 6);
  const dangerEnd = levelLightColor(false, 0);
  const impactWhite = levelLightColor(false, -1, 1);

  assert.ok(empty[2] > 0.95 && empty[0] < 0.1, "an empty level is solid blue");
  assert.ok(occupied[0] > 0.95 && occupied[2] < 0.1, "an occupied level is solid red");
  assert.ok(
    halfway[0] > 0.7 && halfway[2] > 0.7,
    "the original square-root fade visibly passes through purple",
  );
  assert.deepEqual(dangerEmpty, empty, "danger preserves an empty level's blue base");
  assert.deepEqual(dangerOccupied, occupied, "danger preserves an occupied level's red base");
  assert.deepEqual(dangerWhite, [1, 1, 1], "the full-board flash reaches white");
  assert.deepEqual(dangerEnd, empty, "the 12-tick flash returns exactly to its base color");
  assert.deepEqual(impactWhite, [1, 1, 1], "an impacted row independently reaches white");
});

test("dying blocks use the original pair of triangular flashes", () => {
  const expected = [0, 1 / 3, 2 / 3, 1, 2 / 3, 1 / 3, 0, 1 / 3, 2 / 3, 1, 2 / 3, 1 / 3];
  expected.forEach((value, age) => {
    assert.ok(Math.abs(doubleTriangularFlash(age / 12) - value) < 1e-12);
  });
});

test("normal messages pulse on the original 320-tick cycle", () => {
  assert.equal(messagePulseAlpha(0), 1);
  assert.equal(messagePulseAlpha(1600), 0.75);
  assert.equal(messagePulseAlpha(3200), 1);
  assert.equal(messagePulseAlpha(6400), 1);
});

test("the countdown recreates the original rush toward the viewer", () => {
  const start = countdownVisual("3", 0);
  const middle = countdownVisual("3", 0.5);
  const end = countdownVisual("3", 1);
  const goHold = countdownVisual("GO!", 0.15);
  const goFade = countdownVisual("GO!", 0.8);

  assert.deepEqual(start, { alpha: 1, scale: 1, verticalBlend: 1 });
  assert.ok(middle.scale > 1 && middle.scale < 7);
  assert.ok(middle.verticalBlend < start.verticalBlend);
  assert.equal(end.scale, 7);
  assert.equal(end.alpha, 0);
  assert.equal(goHold.scale, 7);
  assert.equal(goHold.alpha, 1, "Fight holds at full opacity before fading");
  assert.ok(goFade.alpha > 0 && goFade.alpha < 1);
});

test("game over falls from above and settles at the original playfield midpoint", () => {
  const pixelsPerWorldUnit = CELL_SIZE / 2;
  const middle = gameOverCenterY(
    1000,
    BOARD_TOP,
    BOARD_HEIGHT,
    pixelsPerWorldUnit,
  );

  assert.equal(gameOverCenterY(0, BOARD_TOP, BOARD_HEIGHT, pixelsPerWorldUnit), -148);
  assert.ok(middle < 410);
  assert.ok(middle >= -148);
  assert.equal(gameOverCenterY(10000, BOARD_TOP, BOARD_HEIGHT, pixelsPerWorldUnit), 410);
});

test("garbage flashes twice, then its 3D shell clips away bottom-to-top", () => {
  const height = 3;
  const firstFlash = garbageShatterVisual(3 / 65, height);
  const betweenFlashes = garbageShatterVisual(6 / 65, height);
  const secondFlash = garbageShatterVisual(9 / 65, height);
  const clipStart = garbageShatterVisual(12 / 65, height);
  const clipMiddle = garbageShatterVisual((12 + 53 / 2) / 65, height);
  const clipEnd = garbageShatterVisual(1, height);

  assert.equal(firstFlash.flash, 1);
  assert.equal(betweenFlashes.flash, 0);
  assert.equal(secondFlash.flash, 1);
  assert.equal(clipStart.clipMinY, -height, "the intact shell begins at its bottom edge");
  assert.ok(Math.abs((clipMiddle.clipMinY ?? 1)) < 1e-9);
  assert.equal(clipEnd.clipMinY, height, "the clip plane finishes at the top edge");
});

test("retained garbage sections crunch before the shell closes smoothly", () => {
  const releaseAt = 3800;
  const height = 1;
  const beforeCrunch = retainedGarbageVisual(2799, releaseAt, height);
  const crunchStart = retainedGarbageVisual(2800, releaseAt, height);
  const crunchMiddle = retainedGarbageVisual(3300, releaseAt, height);
  const shellStart = retainedGarbageVisual(3550, releaseAt, height);
  const shellMiddle = retainedGarbageVisual(3675, releaseAt, height);
  const complete = retainedGarbageVisual(3800, releaseAt, height);

  assert.equal(beforeCrunch.sectionCompression, 0);
  assert.equal(crunchStart.sectionCompression, 0);
  assert.equal(crunchMiddle.sectionCompression, 0.5);
  assert.equal(crunchMiddle.shellVisible, false, "the shell stays absent for the first 750ms");
  assert.equal(shellStart.sectionCompression, 0.75);
  assert.equal(shellStart.shellVisible, true);
  assert.equal(shellStart.shellClipMinY, height, "the shell starts with only its top edge exposed");
  assert.ok(Math.abs(shellMiddle.shellClipMinY ?? 1) < 1e-9);
  assert.equal(complete.sectionCompression, 1);
  assert.equal(complete.shellClipMinY, -height, "the closed shell reaches its bottom edge");
});

test("the game-over blackout covers projected pieces beyond every board edge", () => {
  const bounds = gameOverMaskBounds(BOARD_X, BOARD_TOP, BOARD_WIDTH, BOARD_HEIGHT, CELL_SIZE);
  assert.ok(bounds.x < BOARD_X - 2);
  assert.ok(bounds.x + bounds.width > BOARD_X + BOARD_WIDTH + 2);
  assert.ok(bounds.y < BOARD_TOP);
  assert.ok(bounds.y + bounds.height > BOARD_TOP + BOARD_HEIGHT);
});

test("level lights share the block grid's row boundaries from bottom to top", () => {
  const boardTop = BOARD_BOTTOM - 12 * CELL_SIZE;
  const lights = Array.from(
    { length: 12 },
    (_, level) => levelLightScreenY(level, BOARD_BOTTOM, CELL_SIZE),
  );

  assert.equal(lights[0], BOARD_BOTTOM - CELL_SIZE, "the first light marks row zero's top edge");
  assert.equal(lights[6], BOARD_BOTTOM - 7 * CELL_SIZE, "initial stacks align at their top row");
  assert.equal(lights[11], boardTop, "the final light marks the actual top of the board");
  assert.ok(
    lights.slice(1).every((y, index) => lights[index] - y === CELL_SIZE),
    "the lights use exactly the same pitch as the block grid",
  );
});

test("the lose bar advances from blue through purple to red", () => {
  const safe = loseBarVisual(0);
  const warning = loseBarVisual(3000);
  const purpleEdge = loseBarVisual(5999);
  const critical = loseBarVisual(6500);
  const lost = loseBarVisual(7000);

  assert.equal(safe.phase, "safe");
  assert.deepEqual(safe.leading, safe.trailing);
  assert.deepEqual(safe.trailing, [0, 0, 0.8]);
  assert.equal(warning.phase, "warning");
  assert.equal(warning.progress, 0.5);
  assert.deepEqual(warning.leading, [0.64, 0, 0.64]);
  assert.equal(purpleEdge.phase, "warning", "purple lasts until one second before loss");
  assert.equal(critical.phase, "critical");
  assert.equal(critical.progress, 0.5);
  assert.deepEqual(critical.leading, [0.8, 0, 0]);
  assert.equal(lost.progress, 1);
});

test("the lose bar retains its filled edge while fading and resetting", () => {
  const lowFade = loseBarVisual({ phase: "fade-low", progress: 0.4, fade: 0.5 });
  const highFade = loseBarVisual({ phase: "fade-high", progress: 0.6, fade: 0.5 });
  const reset = loseBarVisual({ phase: "reset-high", progress: 0.2, fade: 0.5 });

  assert.equal(lowFade.progress, 0.4);
  assert.deepEqual(lowFade.leading, [0.32, 0, 0.72]);
  assert.deepEqual(lowFade.trailing, [0, 0, 0.8]);
  assert.equal(highFade.progress, 0.6);
  assert.deepEqual(highFade.leading, [0.4, 0, 0.4]);
  assert.deepEqual(highFade.trailing, [0.32, 0, 0.72]);
  assert.equal(reset.progress, 0.2);
  assert.deepEqual(reset.leading, [0.72, 0, 0.32]);
  assert.deepEqual(reset.trailing, [0.64, 0, 0.64]);
});

test("pause omits the board and swapper while retaining the surrounding scene", () => {
  assert.equal(playfieldVisible("ready"), false);
  assert.equal(playfieldVisible("paused"), false);
  assert.equal(playfieldVisible("countdown"), true);
  assert.equal(playfieldVisible("playing"), true);
  assert.equal(playfieldVisible("gameover"), true);
});

test("the lose bar highlight peaks in the upper third without changing its material colors", () => {
  const top = loseBarToneAt(0);
  const highlight = loseBarToneAt(0.3);
  const middle = loseBarToneAt(0.52);
  const bottom = loseBarToneAt(1);

  assert.ok(highlight.specular > top.specular);
  assert.ok(highlight.specular > middle.specular);
  assert.ok(middle.light > bottom.light);
  assert.deepEqual(bottom, { light: 0.333, specular: 0 });
});

test("solo scores use the original four-to-seven visible digits", () => {
  assert.equal(formatSoloScore(0), "0000");
  assert.equal(formatSoloScore(22), "0022");
  assert.equal(formatSoloScore(9999), "9999");
  assert.equal(formatSoloScore(10000), "10000");
  assert.equal(formatSoloScore(1234567), "1234567");
  assert.equal(formatSoloScore(12345678), "2345678");
});

test("the opening target advances beyond the original 600-point default", () => {
  assert.equal(scoreToBeat(0), 600);
  assert.equal(scoreToBeat(600), 600);
  assert.equal(scoreToBeat(601), 601);
  assert.equal(scoreToBeat(1427.9), 1427);
  assert.equal(scoreToBeat(Number.NaN), 600);
});

test("garbage uses the original hard 0.2-unit chamfers and full OpenGL depth", () => {
  const mesh = createGarbageMesh(6, 1);
  const coordinates = mesh.faces.flatMap((face) => face.points);
  const xValues = new Set(coordinates.map((point) => point[0].toFixed(1)));
  const yValues = new Set(coordinates.map((point) => point[1].toFixed(1)));
  const zValues = new Set(coordinates.map((point) => point[2].toFixed(1)));
  const bevel = mesh.faces.find((face) => (
    face.normals.some((normal) => normal[1] === 1)
      && face.normals.some((normal) => normal[2] === 1)
  ));

  assert.equal(mesh.frontRing.length, 4, "the front is rectangular, not rounded");
  assert.equal(mesh.faces.length, 26, "six planes, twelve edge bevels, and eight corners are present");
  assert.ok(xValues.has("-6.0") && xValues.has("-5.8") && xValues.has("5.8") && xValues.has("6.0"));
  assert.ok(yValues.has("-1.0") && yValues.has("-0.8") && yValues.has("0.8") && yValues.has("1.0"));
  assert.ok(zValues.has("-1.0") && zValues.has("-0.8") && zValues.has("0.8") && zValues.has("1.0"));
  assert.ok(bevel, "bevel vertices transition between the original axial normals");
  assert.equal(mesh.frontDepth, 1);
});
