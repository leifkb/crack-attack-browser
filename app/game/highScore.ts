export const HIGH_SCORE_KEY = "crack-attack-browser-high-score-v1";
export const DEFAULT_SCORE_TO_BEAT = 600;

export function scoreToBeat(
  highScore: number,
  defaultScore = DEFAULT_SCORE_TO_BEAT,
): number {
  if (!Number.isFinite(highScore)) return defaultScore;
  return Math.max(defaultScore, Math.floor(highScore));
}

export interface ScoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadScoreToBeat(storage: ScoreStorage | null | undefined): number {
  try {
    return scoreToBeat(
      Number(storage?.getItem(HIGH_SCORE_KEY) ?? 0),
      DEFAULT_SCORE_TO_BEAT,
    );
  } catch {
    return DEFAULT_SCORE_TO_BEAT;
  }
}

export function recordScoreToBeat(
  storage: ScoreStorage | null | undefined,
  currentScoreToBeat: number,
  completedScore: number,
): number {
  const nextScoreToBeat = scoreToBeat(completedScore, DEFAULT_SCORE_TO_BEAT);
  if (nextScoreToBeat <= currentScoreToBeat) return currentScoreToBeat;
  try {
    storage?.setItem(HIGH_SCORE_KEY, String(nextScoreToBeat));
  } catch {
    // Preserve the in-memory result for this session when persistence is
    // unavailable, rather than interrupting the animation loop.
  }
  return nextScoreToBeat;
}
