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

export function loadScoreToBeat(storage: ScoreStorage): number {
  return scoreToBeat(
    Number(storage.getItem(HIGH_SCORE_KEY) ?? 0),
    DEFAULT_SCORE_TO_BEAT,
  );
}

export function recordScoreToBeat(
  storage: ScoreStorage,
  currentScoreToBeat: number,
  completedScore: number,
): number {
  const nextScoreToBeat = scoreToBeat(completedScore, DEFAULT_SCORE_TO_BEAT);
  if (nextScoreToBeat <= currentScoreToBeat) return currentScoreToBeat;
  storage.setItem(HIGH_SCORE_KEY, String(nextScoreToBeat));
  return nextScoreToBeat;
}
