import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MeasureTemporalProperty } from '../../mfjson/types'
import { initialTimeState, useTimeStore } from '../../store/timeStore'

const { chart, init } = vi.hoisted(() => {
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
  MarkLineComponent: {},
  TooltipComponent: {},
}))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

import { MeasurePropertyChart } from './MeasurePropertyChart'

const speed: MeasureTemporalProperty = {
  type: 'Measure',
  name: 'speed',
  unit: 'km/h',
  interpolation: 'Linear',
  samples: [
    { time: 1_000, value: 10 },
    { time: 2_000, value: 20 },
  ],
}

describe('MeasurePropertyChart', () => {
  const disconnect = vi.fn()
  const observe = vi.fn()

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(() => ({ disconnect, observe, unobserve: vi.fn() })),
    )
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(1_000, 2_000)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('initializes once, renders normalized data, and disposes cleanly', () => {
    const { rerender, unmount } = render(
      <MeasurePropertyChart property={speed} />,
    )

    expect(init).toHaveBeenCalledTimes(1)
    const initialOption: unknown = chart.setOption.mock.calls[0]?.[0]
    expect(initialOption).toMatchObject({ xAxis: { type: 'time' } })
    expect(chart.setOption.mock.calls[0]?.[1]).toEqual({ notMerge: true })
    expect(
      screen.getByRole('img', { name: 'speed over time' }),
    ).toBeInTheDocument()

    rerender(<MeasurePropertyChart property={speed} />)
    expect(init).toHaveBeenCalledTimes(1)

    unmount()
    expect(disconnect).toHaveBeenCalled()
    expect(chart.dispose).toHaveBeenCalled()
  })

  it('patches only the current-time marker when application time changes', () => {
    render(<MeasurePropertyChart property={speed} />)
    chart.setOption.mockClear()

    act(() => useTimeStore.getState().setCurrentTime(1_500))

    expect(chart.setOption).toHaveBeenCalledOnce()
    const markerOption: unknown = chart.setOption.mock.calls[0]?.[0]
    expect(markerOption).toMatchObject({
      series: [{ markLine: { data: [{ xAxis: 1_500 }] } }],
    })
    expect(chart.setOption.mock.calls[0]?.[1]).toEqual({ lazyUpdate: true })
    expect(screen.getByLabelText('Current speed')).toHaveTextContent('15 km/h')
  })
})
