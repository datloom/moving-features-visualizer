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
  // Two segments of the same logical property (e.g. overlapping
  // TemporalGeometries) can both be simultaneously valid at `currentTime`.
  // Rather than silently pick one, report the ambiguity — see "OVERLAPPING
  // TEMPORAL GEOMETRIES" in the derived-property integration.
  const currentValues = useMemo(() => {
    const byName = new Map<
      string,
      { readonly value: number | undefined; readonly ambiguous: boolean }
    >()
    for (const item of group.series) {
      const value = resolveMeasureValue(
        item.property,
        currentTime,
        playbackRate,
      )
      const existing = byName.get(item.propertyName)
      if (!existing) {
        byName.set(item.propertyName, { value, ambiguous: false })
      } else if (value !== undefined) {
        byName.set(item.propertyName, {
          value: existing.value ?? value,
          ambiguous: existing.ambiguous || existing.value !== undefined,
        })
      }
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

  // One header entry per distinct logical property name, not per segment —
  // a derived property (or any multi-segment source property) commonly has
  // several series sharing the same name, and the header/aria-label should
  // describe the logical property once, not repeat it per segment.
  const distinctProperties = useMemo(() => {
    const seen = new Set<string>()
    return group.series.filter((item) => {
      if (seen.has(item.propertyName)) return false
      seen.add(item.propertyName)
      return true
    })
  }, [group.series])

  return (
    <section
      className="comparison-chart"
      aria-label={`${distinctProperties.map((item) => item.label).join(', ')} comparison`}
    >
      <PropertyChartHeader
        properties={distinctProperties.map((item) => ({
          name: item.propertyName,
          type: 'Measure',
          interpolation: item.property.interpolation,
        }))}
        trailing={
          <div>
            {currentValues.map(([name, state]) => (
              <output
                aria-label={`Current ${name}`}
                className={
                  state.ambiguous
                    ? 'measure-current-value measure-current-value-ambiguous'
                    : 'measure-current-value'
                }
                key={name}
                title={
                  state.ambiguous
                    ? 'Multiple TemporalGeometry segments are simultaneously valid at this time.'
                    : undefined
                }
              >
                {state.ambiguous
                  ? 'Ambiguous'
                  : state.value === undefined
                    ? 'No data'
                    : state.value.toLocaleString()}
              </output>
            ))}
          </div>
        }
      />
      <div className="comparison-chart-canvas" ref={containerRef} role="img" />
    </section>
  )
}
