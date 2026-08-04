import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeThumbpadMotion,
  horizontalSwipePair,
} from "../app/game/touchControls.ts";

test("thumbpad motion emits repeated cardinal cursor steps with a remainder", () => {
  const motion = consumeThumbpadMotion(71, 5, 24);

  assert.deepEqual(motion.steps, [
    { dx: 1, dy: 0 },
    { dx: 1, dy: 0 },
  ]);
  assert.equal(motion.remainderX, 23);
  assert.equal(motion.remainderY, 0);
});

test("thumbpad motion chooses one dominant axis instead of leaking a diagonal", () => {
  const horizontal = consumeThumbpadMotion(-30, 26, 24);
  const vertical = consumeThumbpadMotion(25, -31, 24);

  assert.deepEqual(horizontal, {
    steps: [{ dx: -1, dy: 0 }],
    remainderX: -6,
    remainderY: 0,
  });
  assert.deepEqual(vertical, {
    steps: [{ dx: 0, dy: -1 }],
    remainderX: 0,
    remainderY: -7,
  });
});

test("thumbpad motion caps work per pointer event without losing distance", () => {
  const motion = consumeThumbpadMotion(200, 0, 20, 3);

  assert.equal(motion.steps.length, 3);
  assert.equal(motion.remainderX, 140);
});

test("horizontal block swipes select the pair in the direction of travel", () => {
  assert.equal(horizontalSwipePair(2, 30, 3, 26), 2);
  assert.equal(horizontalSwipePair(2, -30, 3, 26), 1);
  assert.equal(horizontalSwipePair(5, -30, 0, 26), 4);
  assert.equal(horizontalSwipePair(0, 30, 0, 26), 0);
});

test("horizontal block swipes reject vertical drags and outward edge moves", () => {
  assert.equal(horizontalSwipePair(2, 25, 0, 26), null);
  assert.equal(horizontalSwipePair(2, 30, 29, 26), null);
  assert.equal(horizontalSwipePair(0, -40, 0, 26), null);
  assert.equal(horizontalSwipePair(5, 40, 0, 26), null);
});
