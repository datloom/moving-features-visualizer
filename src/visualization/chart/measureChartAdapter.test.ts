import { describe, expect, it } from 'vitest'

import type { MeasureTemporalProperty } from '../../mfjson/types'
import {
  buildCurrentTimeMarkerOption,
  buildMeasureChartOption,
  resolveMeasureValue,
} from './measureChartAdapter'

const property = (
  interpolation: MeasureTemporalProperty['interpolation'],
): MeasureTemporalProperty => ({
  type: 'Measure',
  name: 'speed',
  unit: 'km/h',
  interpolation,
  samples: [
    { time: 1_000, value: 10 },
    { time: 2_000, value: 20 },
    { time: 3_000, value: 15 },
  ],
})

describe('Measure chart adapter', () => {
  it('maps normalized samples onto a time/value line with units and zoom', () => {
    const option = buildMeasureChartOption(property('Linear'), 1_500)
    const series = Array.isArray(option.series)
      ? option.series[0]
      : option.series

    expect(option.xAxis).toMatchObject({ type: 'time' })
    expect(option.yAxis).toMatchObject({ type: 'value', name: 'km/h' })
    expect(option.dataZoom).toHaveLength(2)
    expect(series).toMatchObject({
      type: 'line',
      step: false,
      data: [
        [1_000, 10],
        [2_000, 20],
        [3_000, 15],
      ],
      markLine: { data: [{ xAxis: 1_500 }] },
    })
  })

  it('represents Step properties with a step line', () => {
    const option = buildMeasureChartOption(property('Step'), 1_500)
    const series = Array.isArray(option.series)
      ? option.series[0]
      : option.series

    expect(series).toMatchObject({ type: 'line', step: 'end' })
  })

  it('represents Discrete properties as unconnected points', () => {
    const option = buildMeasureChartOption(property('Discrete'), 1_500)
    const series = Array.isArray(option.series)
      ? option.series[0]
      : option.series

    expect(series).toMatchObject({ type: 'scatter' })
  })

  it('builds a marker-only patch without rebuilding chart data', () => {
    const option = buildCurrentTimeMarkerOption(2_500)
    const series = Array.isArray(option.series)
      ? option.series[0]
      : option.series

    expect(series).toMatchObject({
      id: 'measure-property-series',
      markLine: { data: [{ xAxis: 2_500 }] },
    })
    expect(series).not.toHaveProperty('data')
  })

  it('resolves values according to interpolation semantics', () => {
    expect(resolveMeasureValue(property('Linear'), 1_500)).toBe(15)
    expect(resolveMeasureValue(property('Step'), 1_500)).toBe(10)
    expect(resolveMeasureValue(property('Discrete'), 1_500)).toBeUndefined()
    expect(resolveMeasureValue(property('Discrete'), 2_000)).toBe(20)
  })

  it('renders Regression observations and fitted line from the current-value model', () => {
    const regression: MeasureTemporalProperty = {
      ...property('Regression'),
      samples: [
        { time: 0, value: 0 },
        { time: 10, value: 0 },
        { time: 20, value: 90 },
      ],
    }
    const option = buildMeasureChartOption(regression, 15)
    const series = Array.isArray(option.series)
      ? option.series
      : [option.series]
    expect(series).toHaveLength(2)
    expect(series[0]).toMatchObject({
      type: 'scatter',
      data: [
        [0, 0],
        [10, 0],
        [20, 90],
      ],
    })
    expect(series[1]).toMatchObject({
      type: 'line',
      showSymbol: false,
      data: [
        [0, -15],
        [20, 75],
      ],
    })
    expect(resolveMeasureValue(regression, 15)).toBeCloseTo(52.5)
    expect(resolveMeasureValue(regression, 25)).toBeUndefined()
  })
})
