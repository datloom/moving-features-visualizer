import type { EChartsOption, SeriesOption } from 'echarts'

import type { MeasureComparisonSeries } from './measureComparison'

const COLORS = [
  '#35d4c7',
  '#f3b85b',
  '#78a9ff',
  '#e782c2',
  '#9dcc65',
  '#ff8066',
]

const markLine = (currentTime: number) => ({
  animation: false,
  symbol: ['none', 'none'],
  label: { show: false },
  lineStyle: { color: '#f3b85b', type: 'solid' as const, width: 2 },
  data: [{ xAxis: currentTime }],
})

const buildSeries = (
  item: MeasureComparisonSeries,
  index: number,
  currentTime: number,
): SeriesOption => {
  const color = COLORS[index % COLORS.length]
  const shared = {
    id: item.id,
    name: item.label,
    data: item.property.samples.map(({ time, value }) => [time, value]),
    animation: false,
    emphasis: { focus: 'series' as const },
    itemStyle: { color },
    markLine: index === 0 ? markLine(currentTime) : undefined,
  }
  if (item.property.interpolation === 'Discrete') {
    return { ...shared, type: 'scatter', symbolSize: item.focused ? 10 : 7 }
  }
  return {
    ...shared,
    type: 'line',
    showSymbol: true,
    symbolSize: item.focused ? 7 : 5,
    lineStyle: { color, width: item.focused ? 3 : 2 },
    step: item.property.interpolation === 'Step' ? 'end' : false,
  }
}

export const buildComparisonCurrentTimeOption = (
  firstSeriesId: string | undefined,
  currentTime: number,
): EChartsOption => ({
  series: firstSeriesId
    ? [{ id: firstSeriesId, markLine: markLine(currentTime) }]
    : [],
})

export const buildMeasureComparisonChartOption = (
  series: readonly MeasureComparisonSeries[],
  currentTime: number,
  startTime: number,
  endTime: number,
  unitLabel?: string,
): EChartsOption => ({
  animation: false,
  backgroundColor: 'transparent',
  color: COLORS,
  grid: { top: 34, right: 24, bottom: 46, left: 56 },
  legend: {
    top: 0,
    type: 'scroll',
    textStyle: { color: '#b8c3ca', fontSize: 10 },
    pageTextStyle: { color: '#91a0ab' },
  },
  tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
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
    type: 'value',
    name: unitLabel,
    nameTextStyle: { color: '#91a0ab' },
    axisLabel: { color: '#91a0ab' },
    splitLine: { lineStyle: { color: '#263139' } },
  },
  dataZoom: [{ type: 'inside', filterMode: 'none' }],
  series: series.map((item, index) => buildSeries(item, index, currentTime)),
})
