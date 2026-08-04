export interface CursorStep {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export interface ConsumedThumbpadMotion {
  steps: CursorStep[];
  remainderX: number;
  remainderY: number;
}

/**
 * Turns relative thumb movement into discrete cursor steps. The minor axis is
 * discarded whenever a step fires, which keeps slightly diagonal thumb travel
 * from producing surprise turns after several intentional moves.
 */
export function consumeThumbpadMotion(
  accumulatedX: number,
  accumulatedY: number,
  stepDistance: number,
  maxSteps = 12,
): ConsumedThumbpadMotion {
  if (!Number.isFinite(stepDistance) || stepDistance <= 0) {
    throw new RangeError("stepDistance must be greater than zero");
  }

  let remainderX = Number.isFinite(accumulatedX) ? accumulatedX : 0;
  let remainderY = Number.isFinite(accumulatedY) ? accumulatedY : 0;
  const steps: CursorStep[] = [];
  const stepLimit = Math.max(0, Math.floor(maxSteps));

  while (steps.length < stepLimit) {
    const horizontalReady = Math.abs(remainderX) >= stepDistance;
    const verticalReady = Math.abs(remainderY) >= stepDistance;
    if (!horizontalReady && !verticalReady) break;

    if (horizontalReady && (!verticalReady || Math.abs(remainderX) >= Math.abs(remainderY))) {
      const dx = remainderX > 0 ? 1 : -1;
      steps.push({ dx, dy: 0 });
      remainderX -= dx * stepDistance;
      remainderY = 0;
    } else {
      const dy = remainderY > 0 ? 1 : -1;
      steps.push({ dx: 0, dy });
      remainderY -= dy * stepDistance;
      remainderX = 0;
    }
  }

  return { steps, remainderX, remainderY };
}

/**
 * Returns the left-hand cursor column for a direct horizontal block swipe.
 * Impossible outward swipes at the two board edges deliberately do nothing.
 */
export function horizontalSwipePair(
  startColumn: number,
  deltaX: number,
  deltaY: number,
  threshold: number,
  columnCount = 6,
  dominance = 1.15,
): number | null {
  if (!Number.isFinite(threshold) || threshold <= 0 || columnCount < 2) return null;
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return null;

  const horizontalDistance = Math.abs(deltaX);
  if (
    horizontalDistance < threshold
    || horizontalDistance < Math.abs(deltaY) * dominance
  ) return null;

  const column = Math.max(0, Math.min(columnCount - 1, Math.floor(startColumn)));
  if (deltaX > 0) return column < columnCount - 1 ? column : null;
  return column > 0 ? column - 1 : null;
}
