import type { TemporalWindow } from '../../mfjson/temporalWindow'
import { timeToDomainRatio } from './imageChartAdapter'

/**
 * Windowing/virtualization math for the Image thumbnail rail — kept pure and
 * DOM-free so it's cheaply testable and reusable independent of scroll/resize
 * event wiring. Positions here are pixel-space, proportional to each
 * sample's real timestamp (never sample index), matching the rail's actual
 * `left` styling.
 */

/** Minimum pixel spacing between neighboring thumbnails before the rail must scroll. */
export const MIN_THUMBNAIL_SPACING_PX = 44

/** Extra pixels rendered beyond the visible scroll viewport on each side. */
export const DEFAULT_OVERSCAN_PX = 320

/**
 * The rail's total (scrollable) width: wide enough to give every sample its
 * own minimum spacing, but never narrower than the container itself (so a
 * small sample count still fills the available width, matching the
 * pre-virtualization layout).
 */
export const computeRailWidth = (
  sampleCount: number,
  containerWidth: number,
): number => Math.max(containerWidth, sampleCount * MIN_THUMBNAIL_SPACING_PX)

/** A sample's pixel x position along the rail, proportional to its timestamp. */
export const sampleRailPosition = (
  time: number,
  domain: TemporalWindow,
  railWidth: number,
): number => timeToDomainRatio(time, domain) * railWidth

export interface VisibleSampleRange {
  /** Inclusive. */
  readonly startIndex: number
  /** Exclusive. */
  readonly endIndex: number
}

/**
 * The index range (into a time-ascending-sorted sample array) whose rail
 * pixel position falls within the scrolled viewport plus overscan. Uses
 * binary search — O(log n) — since `sampleRailPosition` is monotonic
 * non-decreasing for a time-sorted input, so this stays cheap even for
 * thousands of samples evaluated on every scroll/resize tick.
 */
export const computeVisibleSampleRange = (
  samples: readonly { readonly time: number }[],
  domain: TemporalWindow,
  railWidth: number,
  scrollLeft: number,
  viewportWidth: number,
  overscanPx: number = DEFAULT_OVERSCAN_PX,
): VisibleSampleRange => {
  if (samples.length === 0) return { startIndex: 0, endIndex: 0 }

  const lowerBound = scrollLeft - overscanPx
  const upperBound = scrollLeft + viewportWidth + overscanPx
  const positionAt = (index: number) =>
    sampleRailPosition(samples[index]!.time, domain, railWidth)

  // Leftmost index whose position is >= lowerBound.
  let low = 0
  let high = samples.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (positionAt(mid) < lowerBound) low = mid + 1
    else high = mid
  }
  const startIndex = low

  // Leftmost index (from startIndex) whose position exceeds upperBound —
  // i.e. the exclusive end of the in-range run.
  low = startIndex
  high = samples.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (positionAt(mid) <= upperBound) low = mid + 1
    else high = mid
  }

  return { startIndex, endIndex: low }
}
