import { describe, expect, it } from 'vitest'

import { adaptTemporalGeometryQueryOutcome } from './derivedMeasureProperty'
import type {
  TemporalGeometryMetricFailure,
  TemporalGeometryMetricResult,
  TemporalGeometryQueryOutcome,
} from './temporalGeometryQueryOrchestrator'
import type { TemporalGeometryMetricResponse } from './types'

const sequence = (
  datetimes: readonly string[],
  values: readonly number[],
  interpolation = 'Linear',
) => ({ datetimes, values, interpolation })

const response = (
  name: string,
  valueSequence: TemporalGeometryMetricResponse['valueSequence'],
  form = 'KMH',
): TemporalGeometryMetricResponse => ({
  name,
  type: 'TReal',
  form,
  valueSequence,
})

const result = (
  tGeometryId: string,
  response_: TemporalGeometryMetricResponse,
): TemporalGeometryMetricResult => ({
  tGeometryId,
  requestedStart: 0,
  requestedEnd: 1,
  response: response_,
})

const outcome = (
  results: readonly TemporalGeometryMetricResult[],
  failures: readonly TemporalGeometryMetricFailure[] = [],
): TemporalGeometryQueryOutcome => ({
  metric: 'velocity',
  results,
  failures,
  stale: false,
})

describe('adaptTemporalGeometryQueryOutcome', () => {
  it('maps tg-1 + tg-2 + tg-3 into exactly one logical "velocity" property with three provenance-preserving segments', () => {
    const adapted = adaptTemporalGeometryQueryOutcome(
      outcome([
        result(
          'tg-1',
          response('velocity', [
            sequence(['2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z'], [1, 2]),
          ]),
        ),
        result(
          'tg-2',
          response('velocity', [
            sequence(['2026-01-01T10:05:00Z', '2026-01-01T10:06:00Z'], [3, 4]),
          ]),
        ),
        result(
          'tg-3',
          response('velocity', [
            sequence(['2026-01-01T10:10:00Z', '2026-01-01T10:11:00Z'], [5, 6]),
          ]),
        ),
      ]),
    )

    // ONE logical property name, never "velocity-tg-1" etc.
    expect(adapted.name).toBe('velocity')
    expect(new Set(adapted.segments.map((segment) => segment.name))).toEqual(
      new Set(['velocity']),
    )
    // Three internal segments, each retaining its own source TemporalGeometry.
    expect(adapted.segments).toHaveLength(3)
    expect(
      adapted.segments.map((segment) => segment.sourceTemporalGeometryId),
    ).toEqual(['tg-1', 'tg-2', 'tg-3'])
    expect(
      adapted.segments.every((segment) => segment.source === 'derived-server'),
    ).toBe(true)
    expect(
      adapted.segments.every((segment) => segment.metric === 'velocity'),
    ).toBe(true)
  })

  it('preserves each valueSequence entry as its own independent segment (not flattened)', () => {
    const adapted = adaptTemporalGeometryQueryOutcome(
      outcome([
        result(
          'tg-1',
          response('velocity', [
            sequence(['2026-01-01T10:00:00Z'], [1]),
            sequence(['2026-01-01T11:00:00Z'], [2]),
          ]),
        ),
        result(
          'tg-2',
          response('velocity', [sequence(['2026-01-01T12:00:00Z'], [3])]),
        ),
      ]),
    )

    expect(adapted.segments).toHaveLength(3)
    expect(
      adapted.segments.map((segment) => segment.sourceTemporalGeometryId),
    ).toEqual(['tg-1', 'tg-1', 'tg-2'])
  })

  it('never bridges segments — each segment keeps only its own samples, in temporal order', () => {
    const adapted = adaptTemporalGeometryQueryOutcome(
      outcome([
        result(
          'tg-2',
          response('velocity', [sequence(['2026-01-01T12:00:00Z'], [30])]),
        ),
        result(
          'tg-1',
          response('velocity', [
            sequence(['2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z'], [1, 2]),
          ]),
        ),
      ]),
    )

    // Sorted by first-sample time, not by input/result order.
    expect(
      adapted.segments.map((segment) => segment.sourceTemporalGeometryId),
    ).toEqual(['tg-1', 'tg-2'])
    expect(adapted.segments[0]?.samples).toEqual([
      { time: Date.parse('2026-01-01T10:00:00Z'), value: 1 },
      { time: Date.parse('2026-01-01T10:01:00Z'), value: 2 },
    ])
    expect(adapted.segments[1]?.samples).toEqual([
      { time: Date.parse('2026-01-01T12:00:00Z'), value: 30 },
    ])
  })

  it('adapts TReal into the existing Measure TemporalProperty shape', () => {
    const adapted = adaptTemporalGeometryQueryOutcome(
      outcome([
        result(
          'tg-1',
          response('velocity', [sequence(['2026-01-01T10:00:00Z'], [1])]),
        ),
      ]),
    )
    const segment = adapted.segments[0]!
    expect(segment.type).toBe('Measure')
    expect(segment.interpolation).toBe('Linear')
    expect(segment.samples).toEqual([
      { time: Date.parse('2026-01-01T10:00:00Z'), value: 1 },
    ])
  })

  it('preserves each valueSequence interpolation as-is, never deriving it from geometry MotionCurve', () => {
    const adapted = adaptTemporalGeometryQueryOutcome(
      outcome([
        result(
          'tg-1',
          response('velocity', [
            sequence(['2026-01-01T10:00:00Z'], [1], 'Step'),
          ]),
        ),
        result(
          'tg-2',
          response('velocity', [
            sequence(['2026-01-01T12:00:00Z'], [2], 'Discrete'),
          ]),
        ),
      ]),
    )
    const byGeometry = Object.fromEntries(
      adapted.segments.map((segment) => [
        segment.sourceTemporalGeometryId,
        segment.interpolation,
      ]),
    )
    expect(byGeometry).toEqual({ 'tg-1': 'Step', 'tg-2': 'Discrete' })
  })

  it('preserves form from the response', () => {
    const adapted = adaptTemporalGeometryQueryOutcome(
      outcome([
        result(
          'tg-1',
          response(
            'velocity',
            [sequence(['2026-01-01T10:00:00Z'], [1])],
            'MPS',
          ),
        ),
      ]),
    )
    expect(adapted.segments[0]?.form).toBe('MPS')
  })

  it('detects incompatible forms across TemporalGeometries and keeps only the compatible segments', () => {
    const adapted = adaptTemporalGeometryQueryOutcome(
      outcome([
        result(
          'tg-1',
          response(
            'velocity',
            [sequence(['2026-01-01T10:00:00Z'], [1])],
            'KMH',
          ),
        ),
        result(
          'tg-2',
          response(
            'velocity',
            [sequence(['2026-01-01T11:00:00Z'], [2])],
            'MPH', // incompatible with tg-1's KMH
          ),
        ),
        result(
          'tg-3',
          response(
            'velocity',
            [sequence(['2026-01-01T12:00:00Z'], [3])],
            'KMH',
          ),
        ),
      ]),
    )

    // tg-1 and tg-3 (matching KMH) survive; tg-2 (MPH) is excluded and reported.
    expect(
      adapted.segments.map((segment) => segment.sourceTemporalGeometryId),
    ).toEqual(['tg-1', 'tg-3'])
    expect(adapted.segments.every((segment) => segment.form === 'KMH')).toBe(
      true,
    )
    expect(adapted.incompatibleForms).toEqual([
      { tGeometryId: 'tg-2', form: 'MPH' },
    ])
  })
})
