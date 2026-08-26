import type { ImageTemporalProperty, Timestamp } from '../../mfjson/types'
import type { TemporalWindow } from '../../mfjson/temporalWindow'

export interface ImageSample {
  readonly time: Timestamp
  readonly value: string
}

/**
 * Resolves the current Image sample across independent segments, mirroring
 * `resolveTextValue`: Discrete only matches an exact sample time; Step holds
 * the previous sample's value but never crosses a segment gap. The returned
 * sample carries its own source `time`, which for a held Step value may
 * differ from `currentTime` (e.g. an expanded preview should show when the
 * image actually originated, not the live playback time).
 *
 * Always evaluated against the full, unclipped segment data.
 * `TimeStore.currentTime` is already kept inside the active Time Query
 * window by the shared time store, so a Step value that became valid
 * *before* the window start (e.g. right at queryStart) still resolves
 * correctly without pre-filtering samples by the window first — doing that
 * would incorrectly lose a value like this.
 */
export const resolveImageSample = (
  properties: readonly ImageTemporalProperty[],
  currentTime: Timestamp,
): ImageSample | undefined => {
  for (const property of properties) {
    const exact = property.samples.find(
      (sample) => sample.time === currentTime,
    )
    if (exact) return exact
    if (property.interpolation === 'Discrete') continue
    const first = property.samples[0]
    const last = property.samples.at(-1)
    if (!first || !last || currentTime < first.time || currentTime > last.time)
      continue
    for (let index = property.samples.length - 1; index >= 0; index -= 1) {
      const sample = property.samples[index]!
      if (sample.time <= currentTime) return sample
    }
  }
  return undefined
}

/** Convenience wrapper over `resolveImageSample` for callers that only need the value. */
export const resolveImageValue = (
  properties: readonly ImageTemporalProperty[],
  currentTime: Timestamp,
): string | undefined => resolveImageSample(properties, currentTime)?.value

/**
 * Actual source samples across every segment, clipped to the active
 * temporal window (or the full dataset extent when no Time Query is
 * active). Never synthesizes a value at the window boundary — the
 * thumbnail timeline always represents real source samples only, so a Step
 * value valid before the window (see `resolveImageValue`) legitimately has
 * no corresponding thumbnail here.
 */
export const getVisibleImageSamples = (
  properties: readonly ImageTemporalProperty[],
  domain: TemporalWindow,
): readonly ImageSample[] =>
  properties
    .flatMap((property) => property.samples)
    .filter(
      (sample) => sample.time >= domain.start && sample.time <= domain.end,
    )
    .slice()
    .sort((first, second) => first.time - second.time)

/** Position of a timestamp across a domain as a ratio in [0, 1], clamped. */
export const timeToDomainRatio = (
  time: Timestamp,
  domain: TemporalWindow,
): number => {
  if (domain.end <= domain.start) return 0
  return Math.min(
    1,
    Math.max(0, (time - domain.start) / (domain.end - domain.start)),
  )
}
