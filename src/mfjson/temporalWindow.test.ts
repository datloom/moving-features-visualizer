import { describe, expect, it } from 'vitest'

import { geometryAtTime } from './geometryAtTime'
import { geometryTrailSampleTimes } from './geometryTrail'
import {
  clipWindowToSegment,
  isValidTemporalWindow,
  windowedGeometrySampleTimes,
} from './temporalWindow'
import type { GeometryInterpolation, MovingPoint } from './types'

const point = (
  interpolation: GeometryInterpolation,
  longitudes: readonly number[],
  times: readonly number[],
): MovingPoint => ({
  type: 'MovingPoint',
  interpolation,
  samples: longitudes.map((longitude, index) => ({
    time: times[index]!,
    longitude,
    latitude: 0,
  })),
})

describe('isValidTemporalWindow', () => {
  it('accepts an ordered, finite window', () => {
    expect(isValidTemporalWindow({ start: 0, end: 10 })).toBe(true)
    expect(isValidTemporalWindow({ start: 5, end: 5 })).toBe(true)
  })

  it('rejects a reversed or non-finite window', () => {
    expect(isValidTemporalWindow({ start: 10, end: 0 })).toBe(false)
    expect(isValidTemporalWindow({ start: NaN, end: 10 })).toBe(false)
    expect(isValidTemporalWindow({ start: 0, end: Infinity })).toBe(false)
  })
})

describe('clipWindowToSegment', () => {
  const segment = point('Linear', [0, 10], [10_000, 20_000])

  it('returns the query window unchanged when fully inside the segment extent', () => {
    expect(clipWindowToSegment(segment, { start: 12_000, end: 18_000 })).toEqual(
      { start: 12_000, end: 18_000 },
    )
  })

  it('clamps a window that extends past the segment extent', () => {
    expect(clipWindowToSegment(segment, { start: 0, end: 30_000 })).toEqual({
      start: 10_000,
      end: 20_000,
    })
  })

  it('returns undefined for a window entirely before or after the segment', () => {
    expect(clipWindowToSegment(segment, { start: 0, end: 5_000 })).toBeUndefined()
    expect(
      clipWindowToSegment(segment, { start: 25_000, end: 30_000 }),
    ).toBeUndefined()
  })

  it('returns undefined for a segment without samples', () => {
    expect(
      clipWindowToSegment(
        { ...segment, samples: [] },
        { start: 0, end: 10 },
      ),
    ).toBeUndefined()
  })
})

describe('windowedGeometrySampleTimes', () => {
  const samples = [12_000, 14_000, 16_000, 18_000]

  it('Discrete: includes only source samples inside the window, no invented boundaries', () => {
    const segment = point('Discrete', [0, 1, 2, 3], samples)
    const times = windowedGeometrySampleTimes(segment, {
      start: 13_000,
      end: 17_000,
    })
    expect(times).toEqual([14_000, 16_000])
  })

  it('Step: holds the previous sample value at a boundary that falls between samples', () => {
    const segment = point('Step', [0 /* A */, 100 /* B */], [12_000, 14_000])
    const times = windowedGeometrySampleTimes(segment, {
      start: 13_000,
      end: 14_000,
    })
    expect(times).toContain(13_000)
    const evaluated = geometryAtTime(segment, 13_000)
    expect(evaluated?.type).toBe('MovingPoint')
    expect(
      evaluated?.type === 'MovingPoint' ? evaluated.position.longitude : NaN,
    ).toBe(0)
  })

  it('Step: does not treat the boundary as Linear motion', () => {
    const segment = point('Step', [0, 100], [12_000, 14_000])
    const evaluated = geometryAtTime(segment, 13_000)
    // A Linear evaluator would report longitude 50 here; Step must not.
    expect(
      evaluated?.type === 'MovingPoint' ? evaluated.position.longitude : NaN,
    ).toBe(0)
  })

  it('Linear: evaluates boundary times through the shared evaluator', () => {
    const segment = point('Linear', [0, 10], [12_000, 14_000])
    const times = windowedGeometrySampleTimes(segment, {
      start: 13_000,
      end: 14_000,
    })
    expect(times[0]).toBe(13_000)
    expect(times.at(-1)).toBe(14_000)
    const evaluated = geometryAtTime(segment, 13_000)
    expect(
      evaluated?.type === 'MovingPoint' ? evaluated.position.longitude : NaN,
    ).toBe(5)
  })

  it.each(['Quadratic', 'Cubic'] as const)(
    'uses the shared %s evaluator at query boundaries, not a Linear approximation',
    (interpolation) => {
      const longitudes =
        interpolation === 'Quadratic' ? [0, 10, 0] : [0, 10, 0, 20]
      const times_ =
        interpolation === 'Quadratic' ? [0, 10, 20] : [0, 10, 20, 30]
      const segment = point(interpolation, longitudes, times_)
      const times = windowedGeometrySampleTimes(segment, {
        start: 15,
        end: 20,
      })
      expect(times[0]).toBe(15)
      expect(times.at(-1)).toBe(20)
      const boundaryGeometry = geometryAtTime(segment, 15)
      const boundaryLongitude =
        boundaryGeometry?.type === 'MovingPoint'
          ? boundaryGeometry.position.longitude
          : NaN
      // A naive Linear interpolation between t=10 (10) and t=20 (0) would
      // place this boundary at longitude 5; the nonlinear evaluator must not.
      expect(boundaryLongitude).not.toBeCloseTo(5)
    },
  )

  it('returns an empty list when the window does not overlap the segment', () => {
    const segment = point('Linear', [0, 10], samples.slice(0, 2))
    expect(
      windowedGeometrySampleTimes(segment, { start: 100_000, end: 200_000 }),
    ).toEqual([])
  })

  it('returns no times for a single-sample continuous segment (nothing to interpolate)', () => {
    const segment = point('Linear', [5], [1_000])
    expect(
      windowedGeometrySampleTimes(segment, { start: 1_000, end: 1_000 }),
    ).toEqual([])
    expect(
      windowedGeometrySampleTimes(segment, { start: 0, end: 2_000 }),
    ).toEqual([])
  })

  it('handles a single-instant window without crashing', () => {
    const segment = point('Linear', [0, 10], [0, 10_000])
    expect(windowedGeometrySampleTimes(segment, { start: 5_000, end: 5_000 })).toEqual(
      [5_000],
    )
  })

  it('rejects a non-integer or too-small maximum', () => {
    const segment = point('Linear', [0, 10], [0, 10_000])
    expect(() =>
      windowedGeometrySampleTimes(segment, { start: 0, end: 10_000 }, 1.5),
    ).toThrow(RangeError)
    expect(() =>
      windowedGeometrySampleTimes(segment, { start: 0, end: 10_000 }, 1),
    ).toThrow(RangeError)
  })

  it.each(['Linear', 'Quadratic', 'Cubic'] as const)(
    'matches the unclipped trail sample times for %s when the window equals the full extent',
    (interpolation) => {
      const longitudes =
        interpolation === 'Linear'
          ? [0, 10]
          : interpolation === 'Quadratic'
            ? [0, 10, 0]
            : [0, 10, 0, 20]
      const times_ = longitudes.map((_, index) => index * 10_000)
      const segment = point(interpolation, longitudes, times_)
      const full = { start: times_[0]!, end: times_.at(-1)! }
      expect(windowedGeometrySampleTimes(segment, full)).toEqual(
        geometryTrailSampleTimes(segment),
      )
    },
  )
})
