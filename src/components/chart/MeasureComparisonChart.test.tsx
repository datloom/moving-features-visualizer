import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MeasureTemporalProperty } from '../../mfjson/types'
import { initialTimeState, useTimeStore } from '../../store/timeStore'
import type { MeasurePropertyGroup } from '../../visualization/chart/measureComparison'

const { init } = vi.hoisted(() => {
  const chart = {
    dispose: vi.fn(),
    resize: vi.fn(),
    setOption: vi.fn(),
  }
  return { chart, init: vi.fn(() => chart) }
})

vi.mock('echarts/core', () => ({ init, use: vi.fn() }))
vi.mock('echarts/charts', () => ({ LineChart: {}, ScatterChart: {} }))
vi.mock('echarts/components', () => ({
  DataZoomComponent: {},
  GridComponent: {},
  LegendComponent: {},
  MarkLineComponent: {},
  TooltipComponent: {},
}))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

import { MeasureComparisonChart } from './MeasureComparisonChart'

const segment = (time: number, value: number): MeasureTemporalProperty => ({
  type: 'Measure',
  name: 'velocity',
  interpolation: 'Discrete',
  samples: [{ time, value }],
})

const groupOf = (
  properties: readonly MeasureTemporalProperty[],
): MeasurePropertyGroup => ({
  key: 'velocity',
  series: properties.map((property, index) => ({
    id: `property:mf-1:velocity:${index}`,
    label: 'velocity',
    featureId: 'mf-1',
    propertyName: 'velocity',
    property,
    focused: true,
  })),
})

describe('MeasureComparisonChart', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(() => ({
        disconnect: vi.fn(),
        observe: vi.fn(),
        unobserve: vi.fn(),
      })),
    )
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(0, 10_000)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the single current value when only one segment is valid at currentTime', () => {
    useTimeStore.getState().setCurrentTime(1_000)
    render(<MeasureComparisonChart group={groupOf([segment(1_000, 42)])} />)
    const output = screen.getByLabelText('Current velocity')
    expect(output).toHaveTextContent('42')
    expect(output.className).not.toContain('ambiguous')
  })

  it('reports "Ambiguous" instead of silently picking one value when two segments are simultaneously valid (overlapping TemporalGeometries)', () => {
    useTimeStore.getState().setCurrentTime(1_000)
    render(
      <MeasureComparisonChart
        group={groupOf([segment(1_000, 42), segment(1_000, 99)])}
      />,
    )
    const output = screen.getByLabelText('Current velocity')
    expect(output).toHaveTextContent('Ambiguous')
    expect(output.className).toContain('measure-current-value-ambiguous')
  })

  it('shows "No data" when no segment is valid at currentTime', () => {
    useTimeStore.getState().setCurrentTime(5_000)
    render(<MeasureComparisonChart group={groupOf([segment(1_000, 42)])} />)
    expect(screen.getByLabelText('Current velocity')).toHaveTextContent(
      'No data',
    )
  })
})
