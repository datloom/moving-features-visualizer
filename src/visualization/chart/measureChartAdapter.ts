import type { EChartsOption, SeriesOption } from 'echarts'

import type { MeasureTemporalProperty } from '../../mfjson/types'
import {
  evaluateMeasureRegression,
  getMeasureRegressionModel,
} from '../../mfjson/measureRegression'

const SERIES_ID = 'measure-property-series'
const REGRESSION_SERIES_ID = `${SERIES_ID}-regression`

const buildMarkLine = (currentTime: number) => ({
  animation: false,
  symbol: ['none', 'none'],
  label: { show: false },
  lineStyle: { color: '#f3b85b', type: 'solid' as const, width: 2 },
  data: [{ xAxis: currentTime }],
})

const formatAxisTime = (timestamp: number): string =>
  new Date(timestamp).toISOString().slice(11, 19)

const formatTooltipTime = (timestamp: number): string =>
  `${new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')} UTC`

const buildSeries = (property: MeasureTemporalProperty): SeriesOption[] => {
  const shared = {
    id: SERIES_ID,
    name: property.name,
    data: property.samples.map((sample) => [sample.time, sample.value]),
    animation: false,
    emphasis: { focus: 'series' as const },
    itemStyle: { color: '#35d4c7' },
  }

  if (property.interpolation === 'Discrete') {
    return [
      {
        ...shared,
        type: 'scatter',
        symbolSize: 8,
      },
    ]
  }

  if (property.interpolation === 'Regression') {
    const model = getMeasureRegressionModel(property)
    return [
      {
        ...shared,
        name: `${property.name} observations`,
        type: 'scatter',
        symbolSize: 8,
        z: 3,
      },
      {
        id: REGRESSION_SERIES_ID,
        name: `${property.name} regression`,
        type: 'line',
        data: [
          [model.startTime, evaluateMeasureRegression(model, model.startTime)],
          [model.endTime, evaluateMeasureRegression(model, model.endTime)],
        ],
        animation: false,
        showSymbol: false,
        lineStyle: { color: '#35d4c7', width: 2.5 },
        emphasis: { focus: 'series' },
      },
    ]
  }

  return [
    {
      ...shared,
      type: 'line',
      showSymbol: true,
      symbolSize: 6,
      lineStyle: { color: '#35d4c7', width: 2 },
      step: property.interpolation === 'Step' ? 'end' : false,
    },
  ]
}

export const buildCurrentTimeMarkerOption = (
  currentTime: number,
): EChartsOption => ({
  series: [
    {
      id: SERIES_ID,
      markLine: buildMarkLine(currentTime),
    },
  ],
})

export const buildMeasureChartOption = (
  property: MeasureTemporalProperty,
  currentTime: number,
): EChartsOption => {
  const series = buildSeries(property)
  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 16, right: 24, bottom: 50, left: 56, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (value) =>
        `${String(value)}${property.unit ? ` ${property.unit}` : ''}`,
    },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#91a0ab', formatter: formatAxisTime },
      axisLine: { lineStyle: { color: '#44515a' } },
      splitLine: { show: false },
      axisPointer: {
        label: { formatter: ({ value }) => formatTooltipTime(Number(value)) },
      },
    },
    yAxis: {
      type: 'value',
      name: property.unit,
      nameTextStyle: { color: '#91a0ab' },
      axisLabel: { color: '#91a0ab' },
      splitLine: { lineStyle: { color: '#263139' } },
    },
    dataZoom: [
      { type: 'inside', filterMode: 'none' },
      {
        type: 'slider',
        filterMode: 'none',
        height: 14,
        bottom: 8,
        borderColor: '#2d3942',
        backgroundColor: '#151b20',
        fillerColor: 'rgba(53, 212, 199, 0.16)',
        handleStyle: { color: '#35d4c7' },
        textStyle: { color: '#91a0ab' },
      },
    ],
    series: series.map((item, index) =>
      index === 0 ? { ...item, markLine: buildMarkLine(currentTime) } : item,
    ),
  }
}

export const resolveMeasureValue = (
  property: MeasureTemporalProperty,
  currentTime: number,
): number | undefined => {
  const samples = property.samples
  if (property.interpolation === 'Regression') {
    return evaluateMeasureRegression(
      getMeasureRegressionModel(property),
      currentTime,
    )
  }
  const exact = samples.find((sample) => sample.time === currentTime)
  if (exact) return exact.value
  if (property.interpolation === 'Discrete') return undefined

  const nextIndex = samples.findIndex((sample) => sample.time > currentTime)
  if (nextIndex <= 0) return undefined

  const previous = samples[nextIndex - 1]!
  if (property.interpolation === 'Step') return previous.value

  const next = samples[nextIndex]!
  const progress = (currentTime - previous.time) / (next.time - previous.time)
  return previous.value + (next.value - previous.value) * progress
}
