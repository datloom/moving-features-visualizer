import { describe, expect, it } from 'vitest'

import type { MeasureComparisonSeries } from './measureComparison'
import {
  buildComparisonCurrentTimeOption,
  buildMeasureComparisonChartOption,
} from './measureComparisonChartAdapter'

const series = (
  id: string,
  interpolation: 'Discrete' | 'Linear' | 'Step',
): MeasureComparisonSeries => ({
  id,
  label: id,
  featureId: id,
  propertyName: 'speed',
  focused: id === 'selected',
  property: {
    type: 'Measure',
    name: 'speed',
    interpolation,
    unit: 'KMH',
    samples: [{ time: id === 'late' ? 1_500 : 1_000, value: 10 }],
  },
})

describe('Measure comparison ECharts adapter', () => {
  it('preserves mixed Discrete, Linear, and Step rendering semantics', () => {
    const option = buildMeasureComparisonChartOption(
      [
        series('points', 'Discrete'),
        series('line', 'Linear'),
        series('late', 'Step'),
      ],
      1_250,
      1_000,
      2_000,
      'KMH',
    )
    const output = option.series as Array<Record<string, unknown>>
    expect(output[0]?.type).toBe('scatter')
    expect(output[1]).toMatchObject({ type: 'line', step: false })
    expect(output[2]).toMatchObject({
      type: 'line',
      step: 'end',
      data: [[1_500, 10]],
    })
  })

  it('uses the shared time domain and patches only the cursor series', () => {
    const option = buildMeasureComparisonChartOption(
      [series('one', 'Linear')],
      1_250,
      1_000,
      2_000,
    )
    expect(option.xAxis).toMatchObject({ min: 1_000, max: 2_000 })
    expect(buildComparisonCurrentTimeOption('one', 1_500).series).toHaveLength(
      1,
    )
  })
})
