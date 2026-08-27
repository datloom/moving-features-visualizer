import type { EChartsOption, SeriesOption } from 'echarts'

import { resolveDiscreteVisualIndex } from '../../mfjson/discreteVisualWindow'
import type { TextTemporalProperty } from '../../mfjson/types'
import {
  PROPERTY_COMPARISON_CATEGORY_LABEL,
  PROPERTY_COMPARISON_GRID,
} from './propertyComparisonLayout'

const COLOR = '#f3b85b'

const formatTime = (timestamp: number): string =>
  `${new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')} UTC`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const markLine = (currentTime: number) => ({
  animation: false,
  symbol: ['none', 'none'],
  label: { show: false },
  lineStyle: { color: COLOR, type: 'solid' as const, width: 2 },
  data: [{ xAxis: currentTime }],
})

export const getTextCategories = (
  properties: readonly TextTemporalProperty[],
): readonly string[] => {
  const categories: string[] = []
  const seen = new Set<string>()
  for (const property of properties) {
    for (const { value } of property.samples) {
      if (seen.has(value)) continue
      seen.add(value)
      categories.push(value)
    }
  }
  return categories
}

/**
 * Resolves the current Text value for display. Discrete uses the shared
 * visual-visibility window (see `discreteVisualWindow.ts`) — a presentation
 * widening only, so the sample stays perceptible during playback without
 * holding until the next sample (that would be Step). `playbackRate` widens
 * that window further at fast playback, never past its safety caps.
 */
export const resolveTextValue = (
  properties: readonly TextTemporalProperty[],
  currentTime: number,
  playbackRate = 1,
): string | undefined => {
  for (const property of properties) {
    if (property.interpolation === 'Discrete') {
      const index = resolveDiscreteVisualIndex(
        property.samples.map((sample) => sample.time),
        currentTime,
        playbackRate,
      )
      if (index !== undefined) return property.samples[index]!.value
      continue
    }
    const exact = property.samples.find((sample) => sample.time === currentTime)
    if (exact) return exact.value
    const first = property.samples[0]
    const last = property.samples.at(-1)
    if (!first || !last || currentTime < first.time || currentTime > last.time)
      continue
    for (let index = property.samples.length - 1; index >= 0; index -= 1) {
      const sample = property.samples[index]!
      if (sample.time <= currentTime) return sample.value
    }
  }
  return undefined
}

const buildSeries = (
  property: TextTemporalProperty,
  featureId: string,
  segmentIndex: number,
  currentTime: number,
): SeriesOption => {
  const shared = {
    id: `text:${featureId}:${property.name}:${segmentIndex}`,
    name: property.name,
    data: property.samples.map(({ time, value }) => [time, value]),
    animation: false,
    itemStyle: { color: COLOR },
    markLine: segmentIndex === 0 ? markLine(currentTime) : undefined,
  }
  return property.interpolation === 'Discrete'
    ? { ...shared, type: 'scatter', symbolSize: 9 }
    : {
        ...shared,
        type: 'line',
        step: 'end',
        showSymbol: true,
        symbolSize: 7,
        lineStyle: { color: COLOR, width: 3 },
      }
}

export const buildTextCurrentTimeMarkerOption = (
  featureId: string,
  propertyName: string,
  currentTime: number,
): EChartsOption => ({
  series: [
    {
      id: `text:${featureId}:${propertyName}:0`,
      markLine: markLine(currentTime),
    },
  ],
})

export const buildTextChartOption = (
  featureId: string,
  propertyName: string,
  properties: readonly TextTemporalProperty[],
  currentTime: number,
  startTime?: number,
  endTime?: number,
): EChartsOption => ({
  animation: false,
  backgroundColor: 'transparent',
  grid: PROPERTY_COMPARISON_GRID,
  tooltip: {
    trigger: 'item',
    formatter: (params: unknown) => {
      const value = isRecord(params) ? params.value : undefined
      const values: readonly unknown[] = Array.isArray(value) ? value : []
      return `${featureId}<br/>${propertyName}<br/>${formatTime(Number(values[0]))}<br/>${String(values[1])}`
    },
  },
  xAxis: {
    type: 'time',
    min: startTime,
    max: endTime,
    axisLabel: {
      color: '#91a0ab',
      formatter: (value: number) => new Date(value).toISOString().slice(11, 19),
    },
    axisLine: { lineStyle: { color: '#44515a' } },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'category',
    data: [...getTextCategories(properties)],
    axisLabel: { color: '#b8c3ca', ...PROPERTY_COMPARISON_CATEGORY_LABEL },
    axisLine: { lineStyle: { color: '#44515a' } },
    splitLine: { lineStyle: { color: '#263139' } },
  },
  dataZoom: [{ type: 'inside', filterMode: 'none' }],
  series: properties.map((property, index) =>
    buildSeries(property, featureId, index, currentTime),
  ),
})
