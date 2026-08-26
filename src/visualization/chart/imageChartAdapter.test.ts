import { describe, expect, it } from 'vitest'

import type { ImageTemporalProperty } from '../../mfjson/types'
import {
  getVisibleImageSamples,
  resolveImageSample,
  resolveImageValue,
  timeToDomainRatio,
} from './imageChartAdapter'

const t0 = Date.parse('2026-08-24T10:00:00Z')
const t1 = Date.parse('2026-08-24T10:03:00Z')
const t2 = Date.parse('2026-08-24T10:08:00Z')

const property = (
  interpolation: 'Discrete' | 'Step',
  samples: readonly { readonly time: number; readonly value: string }[],
): ImageTemporalProperty => ({
  type: 'IMAGE',
  name: 'camera',
  interpolation,
  samples,
})

describe('resolveImageValue', () => {
  it('Discrete: matches only exact sample times, never nearest/previous/next', () => {
    const camera = property('Discrete', [
      { time: t0, value: 'A' },
      { time: t1, value: 'B' },
    ])
    expect(resolveImageValue([camera], t0)).toBe('A')
    expect(resolveImageValue([camera], t1)).toBe('B')
    expect(resolveImageValue([camera], t0 + 1)).toBeUndefined()
  })

  it('Step: holds the previous sample between timestamps, exact match at the next', () => {
    const camera = property('Step', [
      { time: t0, value: 'A' },
      { time: t1, value: 'B' },
    ])
    expect(resolveImageValue([camera], t0)).toBe('A')
    expect(resolveImageValue([camera], (t0 + t1) / 2)).toBe('A')
    expect(resolveImageValue([camera], t1)).toBe('B')
  })

  it('does not resolve a value before the first or after the last sample', () => {
    const camera = property('Step', [
      { time: t0, value: 'A' },
      { time: t1, value: 'B' },
    ])
    expect(resolveImageValue([camera], t0 - 1)).toBeUndefined()
    expect(resolveImageValue([camera], t1 + 1)).toBeUndefined()
  })

  it('Step never carries a value across an independent segment gap', () => {
    const segmentA = property('Step', [
      { time: t0, value: 'A' },
      { time: t0 + 60_000, value: 'B' },
    ])
    const segmentB = property('Step', [{ time: t2, value: 'C' }])
    // A time strictly between the two segments belongs to neither.
    const gapTime = t0 + 5 * 60_000
    expect(resolveImageValue([segmentA, segmentB], gapTime)).toBeUndefined()
    expect(resolveImageValue([segmentA, segmentB], t2)).toBe('C')
  })

  it('Time Query + Step boundary: resolves a value from before queryStart without pre-filtering', () => {
    // samples: 10:00 A, 10:03 B, 10:08 C; query 10:01 -> 10:07.
    const camera = property('Step', [
      { time: t0, value: 'A' },
      { time: t1, value: 'B' },
      { time: t2, value: 'C' },
    ])
    const queryStart = t0 + 60_000 // 10:01
    // A's source timestamp (10:00) is outside the query window, but it is
    // still the correct Step value at queryStart.
    expect(resolveImageValue([camera], queryStart)).toBe('A')
  })

  it('Time Query + Step segment gap: does not carry a value merely because the query begins in the gap', () => {
    const segmentA = property('Step', [
      { time: t0, value: 'A' },
      { time: t0 + 60_000, value: 'B' },
    ])
    const segmentB = property('Step', [{ time: t0 + 10 * 60_000, value: 'C' }])
    const queryStart = t0 + 5 * 60_000 // inside the gap between segments
    expect(resolveImageValue([segmentA, segmentB], queryStart)).toBeUndefined()
    expect(
      resolveImageValue([segmentA, segmentB], t0 + 10 * 60_000),
    ).toBe('C')
  })
})

describe('resolveImageSample', () => {
  it('reports the source timestamp of a held Step value, not the query time', () => {
    const camera = property('Step', [
      { time: t0, value: 'A' },
      { time: t1, value: 'B' },
    ])
    const queryStart = t0 + 60_000
    expect(resolveImageSample([camera], queryStart)).toEqual({
      time: t0,
      value: 'A',
    })
  })
})

describe('getVisibleImageSamples', () => {
  it('Time Query + Discrete: contains only actual source samples inside the window, no boundary values', () => {
    // samples: 10:00 A, 10:03 B, 10:08 C; query 10:01 -> 10:07.
    const camera = property('Discrete', [
      { time: t0, value: 'A' },
      { time: t1, value: 'B' },
      { time: t2, value: 'C' },
    ])
    const domain = { start: t0 + 60_000, end: t2 - 60_000 }
    expect(getVisibleImageSamples([camera], domain)).toEqual([
      { time: t1, value: 'B' },
    ])
  })

  it('does not invent a thumbnail at the window boundary for Step', () => {
    const camera = property('Step', [
      { time: t0, value: 'A' },
      { time: t1, value: 'B' },
      { time: t2, value: 'C' },
    ])
    const domain = { start: t0 + 60_000, end: t1 } // 10:01 -> 10:03
    // Only the real 10:03 sample is visible; nothing is synthesized at 10:01.
    expect(getVisibleImageSamples([camera], domain)).toEqual([
      { time: t1, value: 'B' },
    ])
  })

  it('returns no thumbnails when the query misses every sample, even if a Step value is valid throughout', () => {
    const camera = property('Step', [
      { time: t0, value: 'A' },
      { time: t0 + 20 * 60_000, value: 'B' },
    ])
    const domain = { start: t0 + 5 * 60_000, end: t0 + 10 * 60_000 }
    expect(getVisibleImageSamples([camera], domain)).toEqual([])
    expect(resolveImageValue([camera], t0 + 5 * 60_000)).toBe('A')
  })

  it('returns nothing when the query does not intersect the property at all', () => {
    const camera = property('Discrete', [{ time: t0, value: 'A' }])
    const domain = { start: t0 + 60 * 60_000, end: t0 + 120 * 60_000 }
    expect(getVisibleImageSamples([camera], domain)).toEqual([])
    expect(resolveImageValue([camera], t0 + 60 * 60_000)).toBeUndefined()
  })

  it('merges and time-sorts samples across multiple segments, preserving gaps as absent times', () => {
    const segmentA = property('Discrete', [
      { time: t0, value: 'A' },
      { time: t1, value: 'B' },
    ])
    const segmentB = property('Discrete', [{ time: t2, value: 'C' }])
    const domain = { start: t0, end: t2 }
    expect(getVisibleImageSamples([segmentA, segmentB], domain)).toEqual([
      { time: t0, value: 'A' },
      { time: t1, value: 'B' },
      { time: t2, value: 'C' },
    ])
  })
})

describe('timeToDomainRatio', () => {
  it('maps the domain start/end to 0/1 and clamps outside values', () => {
    const domain = { start: 0, end: 100 }
    expect(timeToDomainRatio(0, domain)).toBe(0)
    expect(timeToDomainRatio(100, domain)).toBe(1)
    expect(timeToDomainRatio(25, domain)).toBe(0.25)
    expect(timeToDomainRatio(-10, domain)).toBe(0)
    expect(timeToDomainRatio(110, domain)).toBe(1)
  })

  it('returns 0 for a degenerate zero-length domain rather than dividing by zero', () => {
    expect(timeToDomainRatio(5, { start: 5, end: 5 })).toBe(0)
  })
})
