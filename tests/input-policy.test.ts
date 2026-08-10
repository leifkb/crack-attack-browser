import assert from "node:assert/strict";
import test from "node:test";

import {
  gameKeyboardAction,
  gameOverRestartPrompt,
  hasTouchControls,
} from "../app/game/inputPolicy.ts";

test("the ready prompt really accepts ordinary keys without hijacking modifiers", () => {
  assert.equal(gameKeyboardAction({ status: "ready", key: "x" }), "start");
  assert.equal(gameKeyboardAction({ status: "ready", key: "ArrowLeft" }), "start");
  assert.equal(gameKeyboardAction({ status: "ready", key: "Shift" }), null);
  assert.equal(gameKeyboardAction({ status: "ready", key: "r", ctrlKey: true }), null);
  assert.equal(gameKeyboardAction({ status: "ready", key: " ", repeat: true }), null);
});

test("game-over keyboard restart remains deliberate and delay-gated", () => {
  assert.equal(gameKeyboardAction({
    status: "gameover",
    key: "Enter",
    restartReady: false,
  }), null);
  assert.equal(gameKeyboardAction({
    status: "gameover",
    key: "x",
    restartReady: true,
  }), null);
  assert.equal(gameKeyboardAction({
    status: "gameover",
    key: "Enter",
    restartReady: true,
  }), "restart");
});

test("only actions available in the current game state are handled", () => {
  assert.equal(gameKeyboardAction({ status: "ready", key: "Tab" }), null);
  assert.equal(gameKeyboardAction({ status: "countdown", key: "ArrowDown" }), "move-down");
  assert.equal(gameKeyboardAction({ status: "countdown", key: " " }), "swap");
  assert.equal(gameKeyboardAction({ status: "countdown", key: "Enter" }), "raise");
  assert.equal(gameKeyboardAction({ status: "paused", key: "ArrowDown" }), null);
  assert.equal(gameKeyboardAction({ status: "paused", key: "p" }), "pause");
  assert.equal(gameKeyboardAction({ status: "paused", key: "Escape" }), "concede");
  assert.equal(gameKeyboardAction({ status: "countdown", key: "Escape" }), null);
  assert.equal(gameKeyboardAction({ status: "playing", key: " " }), "swap");
  assert.equal(gameKeyboardAction({ status: "playing", key: "Escape" }), "concede");
  assert.equal(
    gameKeyboardAction({ status: "playing", key: "Escape", repeat: true }),
    null,
  );
});

test("held movement keys wait for a fresh key edge instead of browser repeat", () => {
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"]) {
    assert.notEqual(gameKeyboardAction({ status: "playing", key }), null);
    assert.equal(gameKeyboardAction({ status: "playing", key, repeat: true }), null);
  }
});

test("touch controls appear for hybrid devices as well as coarse-primary devices", () => {
  assert.equal(hasTouchControls(true, 0), true);
  assert.equal(hasTouchControls(false, 5), true);
  assert.equal(hasTouchControls(false, 0), false);
});

test("the result prompt exposes both lockout progress and the unlocked action", () => {
  assert.deepEqual(gameOverRestartPrompt(1, 1500), {
    ready: false,
    remainingMs: 1499,
    text: "Restart available in 1.5s",
  });
  assert.deepEqual(gameOverRestartPrompt(1500, 1500), {
    ready: true,
    remainingMs: 0,
    text: "Press Space or Enter, or tap, to play again",
  });
});
