import assert from "node:assert/strict";
import test from "node:test";

import {
  HIGH_SCORE_KEY,
  loadScoreToBeat,
  recordScoreToBeat,
  type ScoreStorage,
} from "../app/game/highScore.ts";

function memoryStorage(initial?: string): ScoreStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) {
      return key === HIGH_SCORE_KEY ? this.value : null;
    },
    setItem(key, value) {
      if (key === HIGH_SCORE_KEY) this.value = value;
    },
  };
}

test("score to beat persists completed scores above 600", () => {
  const storage = memoryStorage();
  assert.equal(loadScoreToBeat(storage), 600);

  const improved = recordScoreToBeat(storage, 600, 847);
  assert.equal(improved, 847);
  assert.equal(storage.value, "847");
  assert.equal(loadScoreToBeat(storage), 847);

  assert.equal(recordScoreToBeat(storage, 847, 700), 847);
  assert.equal(storage.value, "847", "a lower later score does not replace the record");
});
