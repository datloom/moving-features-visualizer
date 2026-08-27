import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MovingFeature } from '../../mfjson/types'
import { initialFeatureState, useFeatureStore } from '../../store/featureStore'
import { useServerCollectionStore } from '../../store/serverCollectionStore'
import { ComputeTemporalPropertyDialog } from './ComputeTemporalPropertyDialog'

/**
 * Exercises the REAL Compute path end to end — the dialog, the real
 * orchestrator, the real API client — stubbing only the global `fetch`.
 * Unlike `ComputeTemporalPropertyDialog.test.tsx` (which mocks
 * `runTemporalGeometryQuery` to isolate the dialog's own UI wiring), this
 * file exists specifically to catch a break *between* that mock boundary
 * and the actual outgoing HTTP request — i.e. "clicking Compute reaches
 * fetch() with the correct URL," with nothing stubbed in between.
 */

const SERVER_SESSION = {
  baseUrl: 'http://localhost:5050',
  collectionId: 'b71a9504-8872-4c47-a387-907feaa9d738',
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

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const validVelocityResponse = {
  name: 'velocity',
  type: 'TReal',
  form: 'KMH',
  valueSequence: [
    {
      datetimes: ['2023-11-20T13:30:00Z'],
      values: [1],
      interpolation: 'Linear',
    },
  ],
}

beforeEach(() => {
  useFeatureStore.setState(initialFeatureState)
  useServerCollectionStore.setState({
    session: undefined,
    loadingMore: false,
    error: undefined,
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ComputeTemporalPropertyDialog — real fetch (one TemporalGeometry)', () => {
  const feature: MovingFeature = {
    id: '0e21f2eb-7bd6-4731-a0ed-ad07fff66561',
    type: 'MovingFeature',
    temporalGeometry: {
      segments: [
        {
          id: 'de95d397-ffc7-4ae9-a730-4211757add8c',
          type: 'MovingPoint',
          interpolation: 'Linear',
          samples: [
            {
              time: Date.parse('2023-11-20T13:00:00Z'),
              longitude: 0,
              latitude: 0,
            },
            {
              time: Date.parse('2023-11-20T14:00:00Z'),
              longitude: 1,
              latitude: 1,
            },
          ],
        },
      ],
    },
    temporalProperties: [],
    properties: {},
  }

  it('clicking Compute reaches fetch() exactly once with the expected URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(validVelocityResponse))
    vi.stubGlobal('fetch', fetchMock)
    installServerSession()

    render(
      <ComputeTemporalPropertyDialog
        feature={feature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'velocity' },
    })
    // The single TemporalGeometry (with a retained id) is auto-selected.
    expect(
      screen.getByLabelText<HTMLSelectElement>('Temporal Geometry').value,
    ).toBe('de95d397-ffc7-4ae9-a730-4211757add8c')
    fireEvent.change(screen.getByLabelText('Start (UTC)'), {
      target: { value: '2023-11-20T13:30' },
    })
    fireEvent.change(screen.getByLabelText('End (UTC)'), {
      target: { value: '2023-11-20T13:33' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url] = fetchMock.mock.calls[0]! as [URL]
    expect(url.toString()).toBe(
      'http://localhost:5050/collections/b71a9504-8872-4c47-a387-907feaa9d738' +
        '/items/0e21f2eb-7bd6-4731-a0ed-ad07fff66561' +
        '/tgsequence/de95d397-ffc7-4ae9-a730-4211757add8c/velocity' +
        '?datetime=2023-11-20T13%3A30%3A00.000Z%2F2023-11-20T13%3A33%3A00.000Z',
    )
  })
})

describe('ComputeTemporalPropertyDialog — real fetch ("All Temporal Geometries")', () => {
  const multiFeature: MovingFeature = {
    id: '0e21f2eb-7bd6-4731-a0ed-ad07fff66561',
    type: 'MovingFeature',
    temporalGeometry: {
      segments: ['tg-1', 'tg-2', 'tg-3'].map((id, index) => ({
        id,
        type: 'MovingPoint' as const,
        interpolation: 'Linear' as const,
        samples: [
          {
            time: Date.parse('2023-11-20T13:00:00Z') + index * 3_600_000,
            longitude: 0,
            latitude: 0,
          },
          {
            time: Date.parse('2023-11-20T14:00:00Z') + index * 3_600_000,
            longitude: 1,
            latitude: 1,
          },
        ],
      })),
    },
    temporalProperties: [],
    properties: {},
  }

  it('defaults to "all" and sends one fetch per real tGeometryId — never a literal "all" segment', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(validVelocityResponse))
    vi.stubGlobal('fetch', fetchMock)
    installServerSession()

    render(
      <ComputeTemporalPropertyDialog
        feature={multiFeature}
        onClose={vi.fn()}
        onComputed={vi.fn()}
      />,
    )

    expect(
      screen.getByLabelText<HTMLSelectElement>('Temporal Geometry').value,
    ).toBe('all')
    fireEvent.change(screen.getByLabelText('Metric'), {
      target: { value: 'velocity' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Compute' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const urls = fetchMock.mock.calls.map(([url]) => (url as URL).toString())
    expect(urls.some((url) => url.includes('/tgsequence/all/'))).toBe(false)
    for (const id of ['tg-1', 'tg-2', 'tg-3']) {
      expect(
        urls.filter((url) => url.includes(`/tgsequence/${id}/velocity`)),
      ).toHaveLength(1)
    }
  })
})
