import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MovingFeature } from '../../mfjson/types'
import { ComputeTemporalPropertyDialog } from './ComputeTemporalPropertyDialog'

afterEach(cleanup)

const featureWithSegments = (
  segments: MovingFeature['temporalGeometry']['segments'],
): MovingFeature => ({
  id: 'mf-1',
  type: 'MovingFeature',
  temporalGeometry: { segments },
  temporalProperties: [],
  properties: {},
})

const twoSegmentFeature = featureWithSegments([
  {
    id: 'tg-1',
    type: 'MovingPoint',
    interpolation: 'Linear',
    samples: [
      { time: Date.parse('2026-01-01T00:00:00Z'), longitude: 0, latitude: 0 },
      { time: Date.parse('2026-01-01T00:10:00Z'), longitude: 1, latitude: 1 },
    ],
  },
  {
    // No `id` — the normalized model does not retain one for this segment.
    type: 'MovingLineString',
    interpolation: 'Linear',
    samples: [
      {
        time: Date.parse('2026-01-01T00:05:00Z'),
        positions: [{ longitude: 0, latitude: 0 }],
      },
      {
        time: Date.parse('2026-01-01T00:20:00Z'),
        positions: [{ longitude: 1, latitude: 1 }],
      },
    ],
  },
])

describe('ComputeTemporalPropertyDialog', () => {
  it('opens with exactly the three canonical metric options', () => {
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('dialog', { name: /compute temporal property/i }),
    ).toBeInTheDocument()
    const metricSelect = screen.getByLabelText('Metric')
    const options = within(metricSelect).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Select a metric…',
      'Velocity',
      'Acceleration',
      'Distance',
    ])
  })

  it('lists "All Temporal Geometries" plus one entry per segment, disabling one with no retained id', () => {
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
      />,
    )
    const geometrySelect =
      screen.getByLabelText<HTMLSelectElement>('Temporal Geometry')
    const options =
      within(geometrySelect).getAllByRole<HTMLOptionElement>('option')
    expect(options).toHaveLength(3)
    expect(options[0]?.textContent).toBe('All Temporal Geometries')
    expect(options[0]?.disabled).toBe(false)
    expect(options[1]?.textContent).toContain('tg-1')
    expect(options[1]?.disabled).toBe(false)
    // The id-less segment is present but disabled — never fabricated an id.
    expect(options[2]?.disabled).toBe(true)
    expect(options[2]?.textContent).toMatch(/no server geometry id/i)
  })

  it('derives the default Start/End range from the selected geometry', () => {
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
      />,
    )
    // Default selection is "All" (multiple segments) — range spans both.
    const start = screen.getByLabelText<HTMLInputElement>('Start')
    const end = screen.getByLabelText<HTMLInputElement>('End')
    expect(new Date(start.value).getTime()).toBe(
      Date.parse('2026-01-01T00:00:00Z'),
    )
    expect(new Date(end.value).getTime()).toBe(
      Date.parse('2026-01-01T00:20:00Z'),
    )

    fireEvent.change(screen.getByLabelText('Temporal Geometry'), {
      target: { value: 'tg-1' },
    })
    expect(new Date(start.value).getTime()).toBe(
      Date.parse('2026-01-01T00:00:00Z'),
    )
    expect(new Date(end.value).getTime()).toBe(
      Date.parse('2026-01-01T00:10:00Z'),
    )
  })

  it('auto-selects the single geometry when the feature has exactly one with a retained id', () => {
    const singleFeature = featureWithSegments([
      {
        id: 'tg-only',
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 0, longitude: 0, latitude: 0 },
          { time: 10_000, longitude: 1, latitude: 1 },
        ],
      },
    ])
    render(
      <ComputeTemporalPropertyDialog
        feature={singleFeature}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByLabelText<HTMLSelectElement>('Temporal Geometry').value,
    ).toBe('tg-only')
  })

  it('disables Compute until a metric is chosen, with a concise reason shown', () => {
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Compute' })).toBeDisabled()
    expect(screen.getByText('Select a metric to continue.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'velocity' },
    })
    expect(screen.getByRole('button', { name: 'Compute' })).toBeEnabled()
  })

  it('does not perform a network request — Compute only shows a local debug preview', () => {
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'distance' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))
    expect(
      screen.getByText(/server integration is not implemented yet/i),
    ).toBeInTheDocument()
  })

  it('calls onClose from Cancel and from the close icon button', () => {
    const onClose = vi.fn()
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(
      screen.getByRole('button', { name: 'Close compute dialog' }),
    )
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
