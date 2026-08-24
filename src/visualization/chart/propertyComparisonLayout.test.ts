import { describe, expect, it } from 'vitest'

import { buildMeasureComparisonChartOption } from './measureComparisonChartAdapter'
import { PROPERTY_COMPARISON_GRID } from './propertyComparisonLayout'
import { buildTextChartOption } from './textChartAdapter'

describe('Property Comparison layout', () => {
  it('uses the same horizontal plot bounds for Measure and Text charts', () => {
    const measure = buildMeasureComparisonChartOption([], 0, 0, 10)
    const text = buildTextChartOption('mf-1', 'status', [], 0)

    expect(measure.grid).toMatchObject(PROPERTY_COMPARISON_GRID)
    expect(text.grid).toMatchObject(PROPERTY_COMPARISON_GRID)
  })
})
