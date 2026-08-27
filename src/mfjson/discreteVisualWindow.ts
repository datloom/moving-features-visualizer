import type { Timestamp } from './types'

/**
 * Presentation-only widening of Discrete sample visibility.
 *
 * Discrete DOMAIN semantics are unchanged elsewhere in the app: a Discrete
 * sample exists only at its exact source timestamp (see `geometryAtTime`,
 * `resolveMeasureValue`, `resolveTextValue`, `resolveImageSample`). At normal
 * playback speeds that makes a Discrete sample visible for a single frame,
 * which is imperceptible to a human viewer.
 *
 * This module computes a short, per-sample "visual window" — derived only
 * from local timestamp spacing, never a fixed duration — during which the
 * most recently reached Discrete sample stays visible. It is deliberately
 * NOT Step interpolation: the value never holds until the *next* sample,
 * only for a small bounded interval after its own timestamp, and it never
 * shows a value before that value's own timestamp.
 *
 *   Discrete visual window:      ti                 tj
 *                                 ●────   No Data     ●────
 *
 *   Step (NOT this):             ti                          tj
 *                                 ●───────────────────────────
 *
 * Callers evaluating a Discrete series for *display* should resolve the
 * visual sample index/timestamp here first, then hand the exact sample
 * timestamp to the strict domain evaluator — never change the domain
 * evaluator itself to accept a range.
 */

/** Visual epsilon as a fraction of the smaller neighboring gap. ~0.10-0.15 recommended. */
export const DISCRETE_VISIBILITY_RATIO = 0.12

/**
 * Hard ceiling on the visual window as a fraction of the gap to the *next*
 * sample. Keeps the window from ever consuming most of the next interval,
 * which would make Discrete visually indistinguishable from Step.
 */
export const MAX_DISCRETE_INTERVAL_FRACTION = 0.4

/**
 * Minimum wall-clock duration, in milliseconds, a Discrete sample should
 * stay visible where possible. Converted to a data-time duration via the
 * active playback rate (faster playback needs a larger data-time window to
 * cover the same wall-clock time) — but this is always subordinate to
 * `MAX_DISCRETE_INTERVAL_FRACTION`, which is never violated even when the
 * perceptual minimum would ask for more.
 */
export const MIN_PERCEPTUAL_DISPLAY_MS = 400

/** Fallback visual duration (data-time units) when a sample has no neighbor to derive a gap from. */
export const DEFAULT_DISCRETE_VISIBILITY_MS = 400

export interface DiscreteVisualWindow {
  readonly start: Timestamp
  readonly end: Timestamp
}

/**
 * Computes the perceptual visibility window for the Discrete sample at
 * `timestamps[index]`. Pure and local: only looks at the immediate
 * neighbors within the same series, so it never crosses a segment boundary
 * as long as callers pass one segment's/property's own timestamps.
 */
export const getDiscreteVisualWindow = (
  timestamps: readonly Timestamp[],
  index: number,
  playbackRate = 1,
): DiscreteVisualWindow => {
  const ti = timestamps[index]
  if (ti === undefined) {
    throw new RangeError('index out of range for timestamps.')
  }

  const prevGap = index > 0 ? ti - timestamps[index - 1]! : undefined
  const nextGap =
    index < timestamps.length - 1 ? timestamps[index + 1]! - ti : undefined
  const localGap =
    prevGap !== undefined && nextGap !== undefined
      ? Math.min(prevGap, nextGap)
      : (prevGap ?? nextGap)

  let epsilon =
    localGap !== undefined && localGap > 0
      ? localGap * DISCRETE_VISIBILITY_RATIO
      : DEFAULT_DISCRETE_VISIBILITY_MS

  // Perceptual minimum, in data-time: widen so a fast-forward playback still
  // shows the sample for roughly MIN_PERCEPTUAL_DISPLAY_MS of real time.
  const effectiveRate =
    Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1
  epsilon = Math.max(epsilon, MIN_PERCEPTUAL_DISPLAY_MS * effectiveRate)

  // Never cross into (most of) the next sample's interval — this is what
  // keeps a Discrete pulse from behaving like Step under any circumstance,
  // including a large perceptual-minimum boost at fast playback rates.
  if (nextGap !== undefined && nextGap > 0) {
    epsilon = Math.min(epsilon, nextGap * MAX_DISCRETE_INTERVAL_FRACTION)
  }

  return { start: ti, end: ti + epsilon }
}

/**
 * Finds the Discrete sample (if any) whose perceptual visibility window
 * currently covers `currentTime`: the most recently reached sample, shown
 * for its short visual window and then replaced by "No Data" until the next
 * sample's own timestamp. Never shows a sample before its own timestamp.
 */
export const resolveDiscreteVisualIndex = (
  timestamps: readonly Timestamp[],
  currentTime: Timestamp,
  playbackRate = 1,
): number | undefined => {
  if (timestamps.length === 0) return undefined

  // Largest index with timestamps[index] <= currentTime.
  let low = 0
  let high = timestamps.length - 1
  let floorIndex = -1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (timestamps[middle]! <= currentTime) {
      floorIndex = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  if (floorIndex === -1) return undefined

  const window = getDiscreteVisualWindow(timestamps, floorIndex, playbackRate)
  return currentTime < window.end ? floorIndex : undefined
}

/** Convenience wrapper returning the visible sample's own timestamp rather than its index. */
export const resolveDiscreteVisualTime = (
  timestamps: readonly Timestamp[],
  currentTime: Timestamp,
  playbackRate = 1,
): Timestamp | undefined => {
  const index = resolveDiscreteVisualIndex(
    timestamps,
    currentTime,
    playbackRate,
  )
  return index === undefined ? undefined : timestamps[index]
}
