import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DISCRETE_VISIBILITY_MS,
  getDiscreteVisualWindow,
  MAX_DISCRETE_INTERVAL_FRACTION,
  resolveDiscreteVisualIndex,
  resolveDiscreteVisualTime,
} from './discreteVisualWindow'

// Irregular spacing, as required: 10s, 20s, 5s gaps.
const t0 = 0
const t1 = 10_000
const t2 = 30_000
const t3 = 35_000
const timestamps = [t0, t1, t2, t3]

describe('getDiscreteVisualWindow', () => {
  it('derives epsilon for an interior sample from the smaller neighboring gap, not the larger one', () => {
    // 1s before, 30s after — using nextGap alone would make the window
    // several seconds long; it must stay tied to the 1s side.
    const near = [0, 1_000, 31_000]
    const window = getDiscreteVisualWindow(near, 1)
    expect(window.start).toBe(1_000)
    // Small relative to the 30s gap to the next sample — nowhere near Step.
    expect(window.end - window.start).toBeLessThan(1_000)
    expect(window.end).toBeLessThan(31_000)
  })

  it('first sample (no prevGap) derives epsilon from the available next gap', () => {
    const window = getDiscreteVisualWindow(timestamps, 0)
    expect(window.start).toBe(t0)
    expect(window.end).toBeGreaterThan(t0)
    expect(window.end).toBeLessThan(t1)
  })

  it('last sample (no nextGap) derives epsilon from the available previous gap, without crashing or NaN', () => {
    const window = getDiscreteVisualWindow(timestamps, timestamps.length - 1)
    expect(window.start).toBe(t3)
    expect(Number.isFinite(window.end)).toBe(true)
    expect(window.end).toBeGreaterThan(t3)
  })

  it('falls back to a small default duration for a lone sample with no neighbors', () => {
    const window = getDiscreteVisualWindow([5_000], 0)
    expect(window.start).toBe(5_000)
    expect(window.end).toBe(5_000 + DEFAULT_DISCRETE_VISIBILITY_MS)
    expect(Number.isFinite(window.end)).toBe(true)
  })

  it('never exceeds the configured maximum fraction of the next gap, even under a large perceptual-minimum boost', () => {
    const near = [0, 100, 1_100] // tiny local gap, small next gap
    const fastPlaybackRate = 50
    const window = getDiscreteVisualWindow(near, 1, fastPlaybackRate)
    const nextGap = 1_100 - 100
    expect(window.end - window.start).toBeLessThanOrEqual(
      nextGap * MAX_DISCRETE_INTERVAL_FRACTION,
    )
  })

  it('widens toward the perceptual minimum at normal playback rate when the local gap is small', () => {
    const dense = [0, 50, 100_000] // 50ms local gap, generous next gap
    const window = getDiscreteVisualWindow(dense, 1, 1)
    // Ratio alone (50 * 0.12 = 6ms) would be imperceptible; the perceptual
    // minimum should dominate here since it fits under the next-gap cap.
    expect(window.end - window.start).toBeGreaterThan(6)
  })
})

describe('resolveDiscreteVisualIndex / resolveDiscreteVisualTime', () => {
  it('matches the sample exactly at its own timestamp', () => {
    expect(resolveDiscreteVisualIndex(timestamps, t1)).toBe(1)
    expect(resolveDiscreteVisualTime(timestamps, t1)).toBe(t1)
  })

  it('stays visible for a short window after the timestamp, then returns undefined ("No Data")', () => {
    const window = getDiscreteVisualWindow(timestamps, 1)
    expect(resolveDiscreteVisualIndex(timestamps, window.start + 1)).toBe(1)
    expect(resolveDiscreteVisualIndex(timestamps, window.end)).toBeUndefined()
  })

  it('never shows a sample before its own timestamp (no centering, no early reveal)', () => {
    expect(resolveDiscreteVisualIndex(timestamps, t1 - 1)).not.toBe(1)
    expect(resolveDiscreteVisualIndex(timestamps, t0 - 1)).toBeUndefined()
  })

  it('closes well before the next sample under normal spacing — Discrete character, not Step', () => {
    // Between t1's window closing and t2, nothing should be visible.
    const midway = (t1 + t2) / 2
    expect(resolveDiscreteVisualIndex(timestamps, midway)).toBeUndefined()
  })

  it('handles the last sample safely with no next gap to bound it', () => {
    const window = getDiscreteVisualWindow(timestamps, 3)
    expect(resolveDiscreteVisualIndex(timestamps, window.start)).toBe(3)
    expect(
      resolveDiscreteVisualIndex(timestamps, window.end + 1),
    ).toBeUndefined()
  })

  it('returns undefined for an empty series without crashing', () => {
    expect(resolveDiscreteVisualIndex([], 0)).toBeUndefined()
    expect(resolveDiscreteVisualTime([], 0)).toBeUndefined()
  })
})
