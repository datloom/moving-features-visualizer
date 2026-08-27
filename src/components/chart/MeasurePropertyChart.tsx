import { useEffect, useRef } from 'react'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use as registerEChartsModules, type ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

import type { MeasureTemporalProperty } from '../../mfjson/types'
import { useTimeStore } from '../../store/timeStore'
import {
  buildCurrentTimeMarkerOption,
  buildMeasureChartOption,
  resolveMeasureValue,
} from '../../visualization/chart/measureChartAdapter'
import { PropertyChartHeader } from './PropertyChartHeader'

registerEChartsModules([
  LineChart,
  ScatterChart,
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
])

export interface MeasurePropertyChartProps {
  readonly property: MeasureTemporalProperty
}

export function MeasurePropertyChart({ property }: MeasurePropertyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const currentTime = useTimeStore((state) => state.currentTime)
  const playbackRate = useTimeStore((state) => state.playbackRate)
  const currentValue = resolveMeasureValue(property, currentTime, playbackRate)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = init(container, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(container)

    const unsubscribe = useTimeStore.subscribe((state, previousState) => {
      if (state.currentTime === previousState.currentTime) return
      chart.setOption(buildCurrentTimeMarkerOption(state.currentTime), {
        lazyUpdate: true,
      })
    })

    return () => {
      unsubscribe()
      resizeObserver.disconnect()
      chartRef.current = null
      chart.dispose()
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(
      buildMeasureChartOption(property, useTimeStore.getState().currentTime),
      { notMerge: true },
    )
  }, [property])

  return (
    <section
      aria-labelledby={`measure-${property.name}`}
      className="measure-chart-panel"
    >
      <PropertyChartHeader
        properties={[
          {
            name: property.name,
            type: 'Measure',
            interpolation: property.interpolation,
          },
        ]}
        trailing={
          <output
            aria-label={`Current ${property.name}`}
            className="measure-current-value"
          >
            {currentValue === undefined ? '—' : currentValue.toLocaleString()}
            {currentValue !== undefined && property.unit ? (
              <span> {property.unit}</span>
            ) : null}
          </output>
        }
      />
      <div
        aria-label={`${property.name} over time`}
        className="measure-chart-canvas"
        ref={containerRef}
        role="img"
      />
    </section>
  )
}
