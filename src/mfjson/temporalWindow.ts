import type { TemporalGeometry, Timestamp } from './types'

/**
 * A user-selected temporal sub-range ("Time Query") to display/play instead
 * of a segment's full sample extent. Distinct from the segment's own
 * `fullTemporalExtent`, which this never mutates.
 */
export interface TemporalWindow {
  readonly start: Timestamp
  readonly end: Timestamp
}

export const isValidTemporalWindow = (window: TemporalWindow): boolean =>
  Number.isFinite(window.start) &&
  Number.isFinite(window.end) &&
  window.start <= window.end

export const DEFAULT_SUBDIVISIONS = 4
export const MAX_GEOMETRY_TRAIL_SNAPSHOTS = 64

export const boundedSelection = (
  times: readonly Timestamp[],
  maximum: number,
): readonly Timestamp[] => {
  if (times.length <= maximum) return times
  return Array.from(
    { length: maximum },
    (_, index) =>
      times[Math.round((index * (times.length - 1)) / (maximum - 1))]!,
  ).filter((time, index, selected) => time !== selected[index - 1])
}

/**
 * Intersects a query window with a segment's own natural sample extent.
 * Returns undefined when the segment has no geometry inside the window at
 * all (e.g. the segment ends before the window starts) — callers should
 * omit that segment/feature from the windowed view rather than error.
 */
export const clipWindowToSegment = (
  segment: TemporalGeometry,
  window: TemporalWindow,
): TemporalWindow | undefined => {
  const first = segment.samples[0]?.time
  const last = segment.samples.at(-1)?.time
  if (first === undefined || last === undefined) return undefined
  const start = Math.max(window.start, first)
  const end = Math.min(window.end, last)
  return start <= end ? { start, end } : undefined
}

const deduped = (times: readonly Timestamp[]): readonly Timestamp[] =>
  times.filter((time, index) => times.indexOf(time) === index)

/**
 * Sample times to evaluate for a segment clipped to a temporal window,
 * preserving each interpolation mode's existing semantics rather than
 * filtering raw sample timestamps:
 *
 *  - Discrete: only source samples inside the window. No boundary geometry
 *    is invented at the window edges.
 *  - Step: source samples inside the window, plus the window's own start
 *    and end evaluated with the shared evaluator (`geometryAtTime`) so the
 *    "held" value carries through correctly when a boundary falls between
 *    samples.
 *  - Linear/Quadratic/Cubic: the same subdivision density as the unclipped
 *    trail (see `geometryTrailSampleTimes`), restricted to the window, with
 *    the window's start/end always evaluated as boundary times.
 *
 * Callers evaluate each returned time with the existing `geometryAtTime()`
 * evaluator — this function only decides *which* times to sample.
 */
export const windowedGeometrySampleTimes = (
  segment: TemporalGeometry,
  window: TemporalWindow,
  maximum = MAX_GEOMETRY_TRAIL_SNAPSHOTS,
): readonly Timestamp[] => {
  if (!Number.isInteger(maximum) || maximum < 2) {
    throw new RangeError(
      'maximum trail snapshots must be an integer of at least 2.',
    )
  }
  const clipped = clipWindowToSegment(segment, window)
  if (!clipped) return []
  const { start, end } = clipped
  const sourceTimes = segment.samples.map((sample) => sample.time)

  if (segment.interpolation === 'Discrete') {
    return boundedSelection(
      sourceTimes.filter((time) => time >= start && time <= end),
      maximum,
    )
  }

  if (segment.interpolation === 'Step') {
    const inside = sourceTimes.filter((time) => time >= start && time <= end)
    return boundedSelection(deduped([start, ...inside, end]), maximum)
  }

  // A continuous curve needs at least 2 samples; a single-sample segment has
  // no interval to evaluate a boundary against (matches the unwindowed
  // geometryTrailSampleTimes, which likewise yields no times here).
  if (sourceTimes.length < 2) return []

  const times: Timestamp[] = [start]
  for (let index = 0; index < sourceTimes.length - 1; index += 1) {
    const intervalStart = sourceTimes[index]!
    const intervalEnd = sourceTimes[index + 1]!
    if (intervalEnd <= start || intervalStart >= end) continue
    for (
      let subdivision = 1;
      subdivision <= DEFAULT_SUBDIVISIONS;
      subdivision += 1
    ) {
      const time =
        intervalStart +
        ((intervalEnd - intervalStart) * subdivision) / DEFAULT_SUBDIVISIONS
      if (time > start && time < end) times.push(time)
    }
  }
  times.push(end)
  return boundedSelection(deduped(times), maximum)
}
