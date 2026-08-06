/*
 * Input and prompt policy shared by the React shell and deterministic tests.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import type { GameStatus } from "./engine";

export const TOUCH_CAPABILITY_QUERY = "(any-pointer: coarse)";

export type GameKeyboardAction =
  | "start"
  | "restart"
  | "move-left"
  | "move-right"
  | "move-up"
  | "move-down"
  | "swap"
  | "raise"
  | "pause"
  | null;

interface KeyboardActionOptions {
  status: GameStatus;
  key: string;
  repeat?: boolean;
  composing?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  restartReady?: boolean;
}

function isReadyStartKey(key: string): boolean {
  if (key.length === 1) return true;
  return key === "enter"
    || key === "arrowleft"
    || key === "arrowright"
    || key === "arrowup"
    || key === "arrowdown";
}

export function gameKeyboardAction({
  status,
  key,
  repeat = false,
  composing = false,
  altKey = false,
  ctrlKey = false,
  metaKey = false,
  restartReady = false,
}: KeyboardActionOptions): GameKeyboardAction {
  const normalized = key.toLowerCase();
  if (composing || altKey || ctrlKey || metaKey) return null;

  if (status === "ready") {
    return !repeat && isReadyStartKey(normalized) ? "start" : null;
  }
  if (status === "gameover") {
    return restartReady
      && !repeat
      && (normalized === " " || normalized === "enter")
      ? "restart"
      : null;
  }
  if (status === "paused") {
    return normalized === "p" && !repeat ? "pause" : null;
  }

  if (normalized === "p" && !repeat) return "pause";
  if (normalized === "arrowleft" || normalized === "a") return "move-left";
  if (normalized === "arrowright" || normalized === "d") return "move-right";
  if (normalized === "arrowup" || normalized === "w") return "move-up";
  if (normalized === "arrowdown" || normalized === "s") return "move-down";
  if (status !== "playing") return null;
  if ((normalized === " " || normalized === "k") && !repeat) return "swap";
  if (normalized === "enter" || normalized === "l") return "raise";
  return null;
}

export function hasTouchControls(
  coarsePointerMatches: boolean,
  maxTouchPoints: number,
): boolean {
  return coarsePointerMatches || maxTouchPoints > 0;
}

export function gameOverRestartPrompt(
  elapsedMs: number,
  delayMs: number,
): { ready: boolean; remainingMs: number; text: string } {
  const remainingMs = Math.max(0, delayMs - elapsedMs);
  if (remainingMs === 0) {
    return {
      ready: true,
      remainingMs: 0,
      text: "Press Space or Enter, or tap, to play again",
    };
  }

  const remainingTenths = Math.ceil(remainingMs / 100) / 10;
  return {
    ready: false,
    remainingMs,
    text: `Restart available in ${remainingTenths.toFixed(1)}s`,
  };
}
