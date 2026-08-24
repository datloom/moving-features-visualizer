import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TextTemporalProperty } from '../../mfjson/types'
import { initialTimeState, useTimeStore } from '../../store/timeStore'

const { chart, init } = vi.hoisted(() => {
  const chart = { dispose: vi.fn(), resize: vi.fn(), setOption: vi.fn() }
  return { chart, init: vi.fn(() => chart) }
})

vi.mock('echarts/core', () => ({ init, use: vi.fn() }))
vi.mock('echarts/charts', () => ({ LineChart: {}, ScatterChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  MarkLineComponent: {},
  TooltipComponent: {},
}))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

import { TextPropertyChart } from './TextPropertyChart'

const status: TextTemporalProperty = {
  type: 'Text',
  name: 'status',
  interpolation: 'Step',
  samples: [
    { time: 1_000, value: 'moving' },
    { time: 2_000, value: 'stopped' },
  ],
}

describe('TextPropertyChart', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(() => ({ disconnect: vi.fn(), observe: vi.fn() })),
    )
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(1_000, 2_000)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders a categorical timeline and patches only its cursor on time changes', () => {
    render(
      <TextPropertyChart
        featureId="mf-1"
        propertyName="status"
        properties={[status]}
      />,
    )
    const initialOption: unknown = chart.setOption.mock.calls[0]?.[0]
    expect(initialOption).toMatchObject({
      yAxis: { type: 'category', data: ['moving', 'stopped'] },
    })
    expect(screen.getByLabelText('Current status')).toHaveTextContent('moving')

    chart.setOption.mockClear()
    act(() => useTimeStore.getState().setCurrentTime(1_500))

    const markerOption: unknown = chart.setOption.mock.calls[0]?.[0]
    expect(markerOption).toMatchObject({
      series: [
        {
          id: 'text:mf-1:status:0',
          markLine: { data: [{ xAxis: 1_500 }] },
        },
      ],
    })
    expect(chart.setOption.mock.calls[0]?.[1]).toEqual({ lazyUpdate: true })
    expect(screen.getByLabelText('Current status')).toHaveTextContent('moving')
  })
})
