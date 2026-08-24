import { useEffect, useRef } from 'react'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use as registerEChartsModules, type ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

import type { TextTemporalProperty } from '../../mfjson/types'
import { useTimeStore } from '../../store/timeStore'
import {
  buildTextChartOption,
  buildTextCurrentTimeMarkerOption,
  resolveTextValue,
} from '../../visualization/chart/textChartAdapter'
import { PropertyChartHeader } from './PropertyChartHeader'

registerEChartsModules([
  LineChart,
  ScatterChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
])

export function TextPropertyChart({
  featureId,
  propertyName,
  properties,
}: {
  readonly featureId: string
  readonly propertyName: string
  readonly properties: readonly TextTemporalProperty[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const currentTime = useTimeStore((state) => state.currentTime)
  const currentValue = resolveTextValue(properties, currentTime)

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
        buildTextCurrentTimeMarkerOption(
          featureId,
          propertyName,
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
  }, [featureId, propertyName])

  useEffect(() => {
    chartRef.current?.setOption(
      buildTextChartOption(
        featureId,
        propertyName,
        properties,
        useTimeStore.getState().currentTime,
      ),
      { notMerge: true },
    )
  }, [featureId, propertyName, properties])

  return (
    <section
      aria-labelledby={`text-${propertyName}`}
      className="measure-chart-panel"
    >
      <PropertyChartHeader
        properties={[
          {
            name: propertyName,
            type: 'Text',
            interpolation: properties[0]?.interpolation ?? 'Discrete',
          },
        ]}
        trailing={
          <output
            aria-label={`Current ${propertyName}`}
            className="measure-current-value"
          >
            {currentValue ?? 'No data'}
          </output>
        }
      />
      <div
        aria-label={`${propertyName} categorical timeline`}
        className="measure-chart-canvas"
        ref={containerRef}
        role="img"
      />
    </section>
  )
}
