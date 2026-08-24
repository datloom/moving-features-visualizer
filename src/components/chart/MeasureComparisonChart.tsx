import { useEffect, useRef } from 'react'
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
    const time = useTimeStore.getState()
    chartRef.current?.setOption(
      buildMeasureComparisonChartOption(
        group.series,
        time.currentTime,
        time.startTime,
        time.endTime,
        group.unitLabel,
      ),
      { notMerge: true },
    )
  }, [group])

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
      />
      <div className="comparison-chart-canvas" ref={containerRef} role="img" />
    </section>
  )
}
