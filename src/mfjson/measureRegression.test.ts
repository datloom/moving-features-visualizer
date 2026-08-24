import { describe, expect, it } from 'vitest'

import {
  evaluateMeasureRegression,
  fitMeasureRegression,
  getMeasureRegressionModel,
} from './measureRegression'
import type { MeasureTemporalProperty } from './types'

const regressionProperty = (
  times: readonly number[],
  values: readonly number[],
): MeasureTemporalProperty => ({
  type: 'Measure',
  name: 'speed',
  interpolation: 'Regression',
  samples: times.map((time, index) => ({ time, value: values[index]! })),
})

describe('Measure Regression', () => {
  it('fits a centered ordinary least-squares line for epoch timestamps', () => {
    const origin = Date.parse('2026-08-25T00:00:00Z')
    const model = fitMeasureRegression([
      { time: origin, value: 1 },
      { time: origin + 1_000, value: 3 },
      { time: origin + 2_000, value: 5 },
      { time: origin + 3_000, value: 7 },
    ])
    expect(evaluateMeasureRegression(model, origin + 1_500)).toBeCloseTo(4)
  })

  it('uses all non-perfect samples rather than an adjacent pair', () => {
    const model = fitMeasureRegression([
      { time: 0, value: 0 },
      { time: 1, value: 0 },
      { time: 2, value: 9 },
    ])
    expect(evaluateMeasureRegression(model, 1.5)).toBeCloseTo(5.25)
  })

  it('keeps segment models isolated and returns no value in their gap', () => {
    const early = regressionProperty([0, 10], [0, 10])
    const late = regressionProperty([30, 40], [100, 120])
    const earlyModel = getMeasureRegressionModel(early)
    const lateModel = getMeasureRegressionModel(late)
    expect(evaluateMeasureRegression(earlyModel, 20)).toBeUndefined()
    expect(evaluateMeasureRegression(lateModel, 20)).toBeUndefined()
    expect(evaluateMeasureRegression(earlyModel, 5)).toBeCloseTo(5)
    expect(evaluateMeasureRegression(lateModel, 35)).toBeCloseTo(110)
  })
})
