import { useEffect, useMemo, useRef } from 'react'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use as registerEChartsModules, type ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

import { useTimeStore } from '../../store/timeStore'
import type { MeasurePropertyGroup } from '../../visualization/chart/measureComparison'
import {
  buildComparisonCurrentTimeOption,
  buildMeasureComparisonChartOption,
} from '../../visualization/chart/measureComparisonChartAdapter'
import { resolveMeasureValue } from '../../visualization/chart/measureChartAdapter'
import { PropertyChartHeader } from './PropertyChartHeader'

registerEChartsModules([
  LineChart,
  ScatterChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
])

export function MeasureComparisonChart({
  group,
}: {
  readonly group: MeasurePropertyGroup
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const firstSeriesIdRef = useRef(group.series[0]?.id)
  const currentTime = useTimeStore((state) => state.currentTime)
  const startTime = useTimeStore((state) => state.startTime)
  const endTime = useTimeStore((state) => state.endTime)
  const playbackRate = useTimeStore((state) => state.playbackRate)
  const currentValues = useMemo(() => {
    const byName = new Map<string, number | undefined>()
    for (const item of group.series) {
      const value = resolveMeasureValue(item.property, currentTime, playbackRate)
      if (value !== undefined || !byName.has(item.propertyName))
        byName.set(item.propertyName, value)
    }
    return [...byName]
  }, [currentTime, group.series, playbackRate])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = init(container, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(container)
    const unsubscribe = useTimeStore.subscribe((state, previous) => {
      if (state.currentTime === previous.currentTime) return
      chart.setOption(
        buildComparisonCurrentTimeOption(
          firstSeriesIdRef.current,
          state.currentTime,
        ),
        { lazyUpdate: true },
      )
    })
    return () => {
      unsubscribe()
      resizeObserver.disconnect()
      chartRef.current = null
      chart.dispose()
    }
  }, [])

  useEffect(() => {
    firstSeriesIdRef.current = group.series[0]?.id
    chartRef.current?.setOption(
      buildMeasureComparisonChartOption(
        group.series,
        useTimeStore.getState().currentTime,
        startTime,
        endTime,
        group.unitLabel,
      ),
      { notMerge: true },
    )
  }, [group, startTime, endTime])

  return (
    <section
      className="comparison-chart"
      aria-label={`${group.series.map((item) => item.label).join(', ')} comparison`}
    >
      <PropertyChartHeader
        properties={group.series.map((item) => ({
          name: item.propertyName,
          type: 'Measure',
          interpolation: item.property.interpolation,
        }))}
        trailing={
          <div>
            {currentValues.map(([name, value]) => (
              <output
                aria-label={`Current ${name}`}
                className="measure-current-value"
                key={name}
              >
                {value === undefined ? 'No data' : value.toLocaleString()}
              </output>
            ))}
          </div>
        }
      />
      <div className="comparison-chart-canvas" ref={containerRef} role="img" />
    </section>
  )
}
