import type { TemporalWindow } from '../../mfjson/temporalWindow'
import { timeToDomainRatio } from './imageChartAdapter'

/**
 * Density/rendering math for the Image timeline track.
 *
 * The track's total width is FIXED — it matches the same active temporal
 * range as the Measure/Text graphs (never `sampleCount * thumbnailWidth`),
 * so an Image property with 5000 samples over a 6-minute range occupies the
 * same horizontal space as one with 5 samples over that same range. Kept
 * pure and DOM-free so it's cheaply testable independent of ResizeObserver
 * wiring.
 */

/** A sample's pixel x position along the fixed-width track, proportional to its timestamp — never its index. */
export const sampleRailPosition = (
  time: number,
  domain: TemporalWindow,
  trackWidth: number,
): number => timeToDomainRatio(time, domain) * trackWidth

/** Pixel width of one thumbnail "slot" — the density-thinning granularity. */
export const THUMBNAIL_SLOT_PX = 44

export interface SlotSample<T> {
  readonly slotIndex: number
  readonly sample: T
}

/**
 * Picks one stable representative sample per occupied pixel slot along the
 * fixed-width track — bounding the number of rendered *thumbnail images* to
 * roughly `trackWidth / slotWidth` regardless of how many samples exist,
 * without discarding any sample from the domain model (every sample still
 * gets its own lightweight, always-clickable tick mark — see
 * ImageThumbnailStrip). Deliberately independent of currentTime so it can be
 * memoized across playback ticks — the live current sample is highlighted
 * separately by comparing slot indices (see `slotIndexForTime`), never by
 * recomputing this set.
 */
export const selectRepresentativeSamples = <T extends { readonly time: number }>(
  samples: readonly T[],
  domain: TemporalWindow,
  trackWidth: number,
  slotWidth: number = THUMBNAIL_SLOT_PX,
): readonly SlotSample<T>[] => {
  if (samples.length === 0 || trackWidth <= 0 || slotWidth <= 0) return []

  const bySlot = new Map<number, T>()
  for (const sample of samples) {
    const slotIndex = Math.floor(
      sampleRailPosition(sample.time, domain, trackWidth) / slotWidth,
    )
    if (!bySlot.has(slotIndex)) bySlot.set(slotIndex, sample)
  }

  return [...bySlot.entries()]
    .map(([slotIndex, sample]) => ({ slotIndex, sample }))
    .sort((a, b) => a.sample.time - b.sample.time)
}

/** Which pixel slot a given time falls into — used to compare against a representative sample's own `slotIndex` for cheap, O(1)-per-tick "is current" highlighting. */
export const slotIndexForTime = (
  time: number,
  domain: TemporalWindow,
  trackWidth: number,
  slotWidth: number = THUMBNAIL_SLOT_PX,
): number => Math.floor(sampleRailPosition(time, domain, trackWidth) / slotWidth)
