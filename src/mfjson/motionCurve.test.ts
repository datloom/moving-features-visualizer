import { describe, expect, it } from 'vitest'

import {
  evaluatePositionMotionCurve,
  resolveMotionCurveInterval,
  type Position,
} from './motionCurve'
import type { GeometryInterpolation } from './types'

const position = (value: number): Position => ({
  longitude: value,
  latitude: value,
  height: value,
})

const evaluate = (
  timestamps: readonly number[],
  values: readonly number[],
  currentTime: number,
  interpolation: GeometryInterpolation,
) => {
  const resolved = resolveMotionCurveInterval(timestamps, currentTime)
  return resolved
    ? evaluatePositionMotionCurve(
        timestamps,
        values.map(position),
        interpolation,
        resolved,
      )
    : undefined
}

describe('MotionCurve', () => {
  it('implements Discrete and Step sample semantics', () => {
    expect(evaluate([0, 10], [0, 10], 0, 'Discrete')).toEqual(position(0))
    expect(evaluate([0, 10], [0, 10], 5, 'Discrete')).toBeUndefined()
    expect(evaluate([0, 10], [0, 10], 10, 'Discrete')).toEqual(position(10))
    expect(evaluate([0, 10], [0, 10], 5, 'Step')).toEqual(position(0))
    expect(evaluate([0, 10], [0, 10], 10, 'Step')).toEqual(position(10))
  })

  it('uses actual timestamp distance for Linear 3D interpolation', () => {
    expect(evaluate([0, 10, 100], [0, 10, 20], 55, 'Linear')).toEqual(
      position(15),
    )
  })

  it('evaluates the C1 piecewise Quadratic and reproduces samples', () => {
    expect(evaluate([0, 10, 20], [0, 10, 0], 15, 'Quadratic')).toEqual(
      position(10),
    )
    expect(evaluate([0, 10, 20], [0, 10, 0], 20, 'Quadratic')).toEqual(
      position(0),
    )
  })

  it('evaluates Catmull-Rom Cubic and reproduces samples', () => {
    expect(evaluate([0, 10, 20, 30], [0, 10, 0, 10], 15, 'Cubic')).toEqual(
      position(5),
    )
    expect(evaluate([0, 10, 20, 30], [0, 10, 0, 10], 20, 'Cubic')).toEqual(
      position(0),
    )
  })

  it.each([
    ['Step', [0], [0]],
    ['Linear', [0], [0]],
    ['Quadratic', [0, 10], [0, 10]],
    ['Cubic', [0, 10, 20], [0, 10, 20]],
  ] as const)('rejects too few samples for %s', (curve, times, values) => {
    const resolved = resolveMotionCurveInterval(times, times[0])!
    expect(() =>
      evaluatePositionMotionCurve(
        times,
        values.map(position),
        curve,
        resolved,
      ),
    ).toThrow(/requires at least/)
  })
})
