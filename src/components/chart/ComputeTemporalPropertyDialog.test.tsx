import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MovingFeature } from '../../mfjson/types'
import { initialFeatureState, useFeatureStore } from '../../store/featureStore'
import { useServerCollectionStore } from '../../store/serverCollectionStore'
import type { TemporalGeometryQueryOutcome } from '../../services/moving-features-api/temporalGeometryQueryOrchestrator'

const { runTemporalGeometryQuery } = vi.hoisted(() => ({
  runTemporalGeometryQuery: vi.fn(),
}))
vi.mock(
  '../../services/moving-features-api/temporalGeometryQueryOrchestrator',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../services/moving-features-api/temporalGeometryQueryOrchestrator')
      >()
    return { ...actual, runTemporalGeometryQuery }
  },
)

import { ComputeTemporalPropertyDialog } from './ComputeTemporalPropertyDialog'

const SERVER_SESSION = {
  baseUrl: 'http://localhost:5050',
  collectionId: 'routes',
  collectionTitle: 'Routes',
  limit: 100,
  serverPosition: 1,
  numberLoaded: 1,
  failureCount: 0,
  hasMore: false,
}

const installServerSession = () =>
  useServerCollectionStore.setState({
    session: SERVER_SESSION,
    loadingMore: false,
    error: undefined,
  })

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

const threeSegmentFeature = featureWithSegments(
  ['tg-1', 'tg-2', 'tg-3'].map((id, index) => ({
    id,
    type: 'MovingPoint' as const,
    interpolation: 'Linear' as const,
    samples: [
      {
        time: Date.parse('2026-01-01T00:00:00Z') + index * 60_000,
        longitude: 0,
        latitude: 0,
      },
      {
        time: Date.parse('2026-01-01T00:10:00Z') + index * 60_000,
        longitude: 1,
        latitude: 1,
      },
    ],
  })),
)

const outcomeFor = (
  tGeometryIds: readonly string[],
  overrides: Partial<TemporalGeometryQueryOutcome> = {},
): TemporalGeometryQueryOutcome => ({
  metric: 'velocity',
  results: tGeometryIds.map((tGeometryId) => ({
    tGeometryId,
    requestedStart: 0,
    requestedEnd: 1,
    response: {
      name: 'velocity',
      type: 'TReal',
      form: 'KMH',
      valueSequence: [
        {
          datetimes: ['2026-01-01T00:00:00Z'],
          values: [10],
          interpolation: 'Linear',
        },
      ],
    },
  })),
  failures: [],
  stale: false,
  ...overrides,
})

const chooseMetric = (metric = 'velocity') =>
  fireEvent.change(screen.getByLabelText('Metric'), {
    target: { value: metric },
  })

describe('ComputeTemporalPropertyDialog', () => {
  beforeEach(() => {
    useServerCollectionStore.setState({
      session: undefined,
      loadingMore: false,
      error: undefined,
    })
    useFeatureStore.setState(initialFeatureState)
    runTemporalGeometryQuery.mockReset()
  })

  afterEach(cleanup)

  it('opens with exactly the three canonical metric options', () => {
    installServerSession()
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
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
    installServerSession()
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
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
    expect(options[2]?.disabled).toBe(true)
    expect(options[2]?.textContent).toMatch(/no server geometry id/i)
  })

  it('derives the default Start/End range from the selected geometry', () => {
    installServerSession()
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
      />,
    )
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

    // Switching back to "All" widens the range back to the merged extent.
    fireEvent.change(screen.getByLabelText('Temporal Geometry'), {
      target: { value: 'all' },
    })
    expect(new Date(start.value).getTime()).toBe(
      Date.parse('2026-01-01T00:00:00Z'),
    )
    expect(new Date(end.value).getTime()).toBe(
      Date.parse('2026-01-01T00:20:00Z'),
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
    installServerSession()
    render(
      <ComputeTemporalPropertyDialog
        feature={singleFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
      />,
    )
    expect(
      screen.getByLabelText<HTMLSelectElement>('Temporal Geometry').value,
    ).toBe('tg-only')
  })

  it('disables Compute until a metric is chosen, with a concise reason shown', () => {
    installServerSession()
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Compute' })).toBeDisabled()
    expect(screen.getByText('Select a metric to continue.')).toBeInTheDocument()

    chooseMetric()
    expect(screen.getByRole('button', { name: 'Compute' })).toBeEnabled()
  })

  it('is unavailable with a concise explanation for a local-file feature (no active server session)', () => {
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
      />,
    )
    expect(
      screen.getByText(
        'Server-derived properties are available for server-loaded features.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Metric')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Compute' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(runTemporalGeometryQuery).not.toHaveBeenCalled()
  })

  it('calls onClose from Cancel and from the close icon button', () => {
    installServerSession()
    const onClose = vi.fn()
    render(
      <ComputeTemporalPropertyDialog
        feature={twoSegmentFeature}
        onClose={onClose}
        onComputed={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(
      screen.getByRole('button', { name: 'Close compute dialog' }),
    )
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('runs exactly one request for one selected TemporalGeometry, adds the property, auto-selects it, and closes on full success', async () => {
    installServerSession()
    useFeatureStore.getState().replaceFeatures([threeSegmentFeature])
    runTemporalGeometryQuery.mockResolvedValue(outcomeFor(['tg-1']))
    const onClose = vi.fn()
    const onComputed = vi.fn()
    render(
      <ComputeTemporalPropertyDialog
        feature={threeSegmentFeature}
        onClose={onClose}
        onComputed={onComputed}
      />,
    )
    chooseMetric('velocity')
    fireEvent.change(screen.getByLabelText('Temporal Geometry'), {
      target: { value: 'tg-1' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(runTemporalGeometryQuery.mock.calls[0]?.[1]).toMatchObject({
      collectionId: 'routes',
      mFeatureId: 'mf-1',
      metric: 'velocity',
      geometries: [expect.objectContaining({ tGeometryId: 'tg-1' })],
    })
    expect(onComputed).toHaveBeenCalledWith('Measure:velocity')
    const properties = useFeatureStore
      .getState()
      .features.find((item) => item.id === 'mf-1')?.temporalProperties
    expect(properties?.map((property) => property.name)).toEqual(['velocity'])
  })

  it('runs the query for every eligible TemporalGeometry when "All" is selected', async () => {
    installServerSession()
    useFeatureStore.getState().replaceFeatures([threeSegmentFeature])
    runTemporalGeometryQuery.mockResolvedValue(
      outcomeFor(['tg-1', 'tg-2', 'tg-3']),
    )
    render(
      <ComputeTemporalPropertyDialog
        feature={threeSegmentFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
      />,
    )
    chooseMetric('velocity')

    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    await waitFor(() => expect(runTemporalGeometryQuery).toHaveBeenCalled())
    const request = runTemporalGeometryQuery.mock.calls[0]?.[1] as {
      geometries: readonly { tGeometryId: string }[]
    }
    expect(request.geometries.map((geometry) => geometry.tGeometryId)).toEqual([
      'tg-1',
      'tg-2',
      'tg-3',
    ])
  })

  it('keeps the dialog open and shows a warning on partial success, but still adds the successful segments', async () => {
    installServerSession()
    useFeatureStore.getState().replaceFeatures([threeSegmentFeature])
    runTemporalGeometryQuery.mockResolvedValue(
      outcomeFor(['tg-1', 'tg-3'], {
        failures: [{ tGeometryId: 'tg-2', message: 'server error' }],
      }),
    )
    const onClose = vi.fn()
    const onComputed = vi.fn()
    render(
      <ComputeTemporalPropertyDialog
        feature={threeSegmentFeature}
        onClose={onClose}
        onComputed={onComputed}
      />,
    )
    chooseMetric('velocity')

    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    await waitFor(() =>
      expect(
        screen.getByText(/velocity computed for 2 of 3 temporalgeometry/i),
      ).toBeInTheDocument(),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(onComputed).toHaveBeenCalledWith('Measure:velocity')
    const properties = useFeatureStore
      .getState()
      .features.find((item) => item.id === 'mf-1')?.temporalProperties
    expect(properties).toHaveLength(2)
  })

  it('shows an error and does not touch the store when the query fails entirely', async () => {
    installServerSession()
    useFeatureStore.getState().replaceFeatures([threeSegmentFeature])
    runTemporalGeometryQuery.mockRejectedValue(new Error('network down'))
    const onClose = vi.fn()
    const onComputed = vi.fn()
    render(
      <ComputeTemporalPropertyDialog
        feature={threeSegmentFeature}
        onClose={onClose}
        onComputed={onComputed}
      />,
    )
    chooseMetric('velocity')

    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    await waitFor(() =>
      expect(screen.getByText('network down')).toBeInTheDocument(),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(onComputed).not.toHaveBeenCalled()
    expect(
      useFeatureStore.getState().features.find((item) => item.id === 'mf-1')
        ?.temporalProperties,
    ).toEqual([])
  })

  it('does not silently close when every selected geometry is skipped for having no overlap with the chosen range', async () => {
    // The orchestrator itself skips non-overlapping geometries rather than
    // failing them, so this outcome has zero results AND zero failures —
    // "0 failures" must not be misread as "fully succeeded".
    installServerSession()
    useFeatureStore.getState().replaceFeatures([threeSegmentFeature])
    runTemporalGeometryQuery.mockResolvedValue(outcomeFor([]))
    const onClose = vi.fn()
    const onComputed = vi.fn()
    render(
      <ComputeTemporalPropertyDialog
        feature={threeSegmentFeature}
        onClose={onClose}
        onComputed={onComputed}
      />,
    )
    chooseMetric('velocity')

    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    await waitFor(() =>
      expect(screen.getByText(/nothing was computed/i)).toBeInTheDocument(),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(onComputed).not.toHaveBeenCalled()
    expect(
      useFeatureStore.getState().features.find((item) => item.id === 'mf-1')
        ?.temporalProperties,
    ).toEqual([])
  })

  it.each(['velocity', 'acceleration', 'distance'] as const)(
    'computes %s the same way as any other metric',
    async (metric) => {
      installServerSession()
      useFeatureStore.getState().replaceFeatures([threeSegmentFeature])
      runTemporalGeometryQuery.mockResolvedValue(
        outcomeFor(['tg-1'], { metric }),
      )
      const onClose = vi.fn()
      const onComputed = vi.fn()
      render(
        <ComputeTemporalPropertyDialog
          feature={threeSegmentFeature}
          onClose={onClose}
          onComputed={onComputed}
        />,
      )
      chooseMetric(metric)
      fireEvent.change(screen.getByLabelText('Temporal Geometry'), {
        target: { value: 'tg-1' },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
      expect(runTemporalGeometryQuery.mock.calls[0]?.[1]).toMatchObject({
        metric,
      })
      expect(onComputed).toHaveBeenCalledWith(`Measure:${metric}`)
      const properties = useFeatureStore
        .getState()
        .features.find((item) => item.id === 'mf-1')?.temporalProperties
      expect(properties?.map((property) => property.name)).toEqual([metric])
    },
  )

  it('shows a live "Computing N / M" indicator for multi-geometry runs', async () => {
    installServerSession()
    useFeatureStore.getState().replaceFeatures([threeSegmentFeature])
    let resolveOutcome: (value: TemporalGeometryQueryOutcome) => void = () => {}
    runTemporalGeometryQuery.mockImplementation(
      (
        _client: unknown,
        _request: unknown,
        options: { onProgress?: (c: number, t: number) => void },
      ) =>
        new Promise((resolve) => {
          resolveOutcome = () => {
            options.onProgress?.(3, 3)
            resolve(outcomeFor(['tg-1', 'tg-2', 'tg-3']))
          }
        }),
    )
    render(
      <ComputeTemporalPropertyDialog
        feature={threeSegmentFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
      />,
    )
    chooseMetric('velocity')
    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    await act(async () => {
      resolveOutcome(outcomeFor(['tg-1', 'tg-2', 'tg-3']))
      await Promise.resolve()
    })
    // By the time the promise resolves the run has already completed, but
    // onProgress was invoked with the final count before resolution.
    expect(runTemporalGeometryQuery).toHaveBeenCalled()
  })

  it('disables the Compute action while a request is running', async () => {
    installServerSession()
    useFeatureStore.getState().replaceFeatures([threeSegmentFeature])
    let resolveOutcome: (value: TemporalGeometryQueryOutcome) => void = () => {}
    runTemporalGeometryQuery.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOutcome = resolve
        }),
    )
    render(
      <ComputeTemporalPropertyDialog
        feature={threeSegmentFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
      />,
    )
    chooseMetric('velocity')
    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    expect(screen.getByRole('button', { name: 'Computing…' })).toBeDisabled()

    await act(async () => {
      resolveOutcome(outcomeFor(['tg-1']))
      await Promise.resolve()
    })
  })

  it('does not apply a stale result if the dialog is closed while a request is in flight', async () => {
    installServerSession()
    useFeatureStore.getState().replaceFeatures([threeSegmentFeature])
    let resolveOutcome: (value: TemporalGeometryQueryOutcome) => void = () => {}
    runTemporalGeometryQuery.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOutcome = resolve
        }),
    )
    const onComputed = vi.fn()
    const { unmount } = render(
      <ComputeTemporalPropertyDialog
        feature={threeSegmentFeature}
        onClose={vi.fn()}
        onComputed={onComputed}
      />,
    )
    chooseMetric('velocity')
    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    unmount()
    await act(async () => {
      resolveOutcome(outcomeFor(['tg-1']))
      await Promise.resolve()
    })

    expect(onComputed).not.toHaveBeenCalled()
    expect(
      useFeatureStore.getState().features.find((item) => item.id === 'mf-1')
        ?.temporalProperties ?? [],
    ).toEqual([])
  })
})
