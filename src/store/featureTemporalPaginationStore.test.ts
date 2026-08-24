import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MovingFeature } from '../mfjson/types'
import type {
  CollectionLoadResult,
  FeatureTemporalPaginationSeed,
} from '../services/moving-features-api/types'
import { initialFeatureState, useFeatureStore } from './featureStore'
import {
  useFeatureTemporalPaginationStore,
  type FeatureTemporalPaginationState,
} from './featureTemporalPaginationStore'
import { initialTimeState, useTimeStore } from './timeStore'

const start = '2026-01-01T10:00:00Z'
const end = '2026-01-01T11:00:00Z'

const rawGeometry = (id: string, minute: number) => ({
  id,
  type: 'MovingPoint',
  datetimes: [
    `2026-01-01T10:${String(minute).padStart(2, '0')}:00Z`,
    `2026-01-01T10:${String(minute + 1).padStart(2, '0')}:00Z`,
  ],
  coordinates: [
    [139.7 + minute / 100, 35.6],
    [139.71 + minute / 100, 35.61],
  ],
  interpolation: 'Linear',
})

const rawPropertyGroup = (minute: number) => ({
  datetimes: [
    `2026-01-01T10:${String(minute).padStart(2, '0')}:00Z`,
    `2026-01-01T10:${String(minute + 1).padStart(2, '0')}:00Z`,
  ],
  speed: {
    type: 'Measure',
    values: [minute, minute + 1],
    interpolation: 'Linear',
    unit: 'KMH',
  },
})

const feature = (id: string): MovingFeature => ({
  id,
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: Date.parse(start), longitude: 139.7, latitude: 35.6 },
          {
            time: Date.parse('2026-01-01T10:01:00Z'),
            longitude: 139.71,
            latitude: 35.61,
          },
        ],
      },
    ],
  },
  temporalProperties: [
    {
      type: 'Measure',
      name: 'speed',
      interpolation: 'Linear',
      unit: 'KMH',
      samples: [
        { time: Date.parse(start), value: 0 },
        { time: Date.parse('2026-01-01T10:01:00Z'), value: 1 },
      ],
    },
  ],
  properties: {},
})

const seed = (
  featureId: string,
  geometryOffset = 1,
  propertiesOffset = 1,
): FeatureTemporalPaginationSeed => ({
  featureId,
  metadata: {
    id: featureId,
    type: 'Feature',
    time: [start, end],
    properties: {},
  },
  datetime: { start, end },
  normalizationGeometry: rawGeometry('tg-1', 0),
  geometryKeys: ['id:tg-1'],
  propertyGroupKeys: [`content:${JSON.stringify(rawPropertyGroup(0))}`],
  geometry: {
    offset: geometryOffset,
    limit: 10,
    numberMatched: 20,
    numberReturned: geometryOffset,
    hasMore: true,
  },
  properties: {
    offset: propertiesOffset,
    limit: 4,
    numberMatched: 12,
    numberReturned: propertiesOffset,
    hasMore: true,
  },
})

const result = (
  seeds: readonly FeatureTemporalPaginationSeed[],
): CollectionLoadResult => ({
  features: [],
  failures: [],
  pagination: { truncated: false },
  temporalPagination: seeds,
})

const jsonResponse = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

const requestUrl = (input: unknown): URL => {
  if (input instanceof URL) return input
  if (typeof input === 'string') return new URL(input)
  if (input instanceof Request) return new URL(input.url)
  throw new TypeError('Expected a URL-compatible fetch input.')
}

const stateFor = (featureId: string): FeatureTemporalPaginationState => {
  const state = useFeatureTemporalPaginationStore.getState().features[featureId]
  if (!state) throw new Error(`Missing temporal state for ${featureId}`)
  return state
}

describe('Feature temporal pagination store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useFeatureStore.setState(initialFeatureState)
    useTimeStore.setState(initialTimeState)
    useFeatureTemporalPaginationStore.setState({ features: {} })
  })

  it('creates isolated server-only state with independent resource offsets', () => {
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([seed('mf-1', 10, 4), seed('mf-2', 3, 2)]),
        'replace',
      )

    expect(stateFor('mf-1')).toMatchObject({
      geometry: { offset: 10 },
      properties: { offset: 4 },
    })
    expect(stateFor('mf-2')).toMatchObject({
      geometry: { offset: 3 },
      properties: { offset: 2 },
    })
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'replacement',
        result([seed('mf-3')]),
        'replace',
      )
    expect(
      Object.keys(useFeatureTemporalPaginationStore.getState().features),
    ).toEqual(['mf-3'])
    useFeatureTemporalPaginationStore.getState().clear()
    expect(useFeatureTemporalPaginationStore.getState().features).toEqual({})
  })

  it('loads both streams, uses metadata cursors, preserves gaps, and removes overlaps', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([seed('mf-1')]),
        'replace',
      )
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      return url.pathname.endsWith('/tgsequence')
        ? jsonResponse({
            type: 'TemporalGeometrySequence',
            geometrySequence: [
              rawGeometry('tg-1', 0),
              rawGeometry('tg-2', 10),
              rawGeometry('tg-3', 20),
            ],
            numberMatched: 4,
            numberReturned: 3,
          })
        : jsonResponse({
            temporalProperties: [rawPropertyGroup(10)],
            numberMatched: 3,
            numberReturned: 2,
          })
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeatureTemporalPaginationStore.getState().loadMore('mf-1')

    const loaded = useFeatureStore.getState().features[0]!
    expect(loaded.temporalGeometry.segments).toHaveLength(3)
    expect(
      loaded.temporalGeometry.segments.map(
        (segment) => segment.samples[0]?.time,
      ),
    ).toEqual([
      Date.parse(start),
      Date.parse('2026-01-01T10:10:00Z'),
      Date.parse('2026-01-01T10:20:00Z'),
    ])
    expect(loaded.temporalProperties.map(({ name }) => name)).toEqual([
      'speed',
      'speed',
    ])
    expect(stateFor('mf-1')).toMatchObject({
      geometry: { offset: 4, hasMore: false },
      properties: { offset: 3, hasMore: false },
    })
    const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input))
    expect(urls.map((url) => url.searchParams.get('offset'))).toEqual([
      '1',
      '1',
    ])
    for (const url of urls) {
      expect(url.searchParams.get('datetime')).toBe(`${start}/${end}`)
      expect(url.toString()).not.toContain('%22')
    }
  })

  it('keeps successful geometry when properties fail and retries properties only', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureStore.getState().selectFeature('mf-1')
    useTimeStore.setState({
      startTime: Date.parse(start),
      endTime: Date.parse(end),
      currentTime: Date.parse('2026-01-01T10:00:30Z'),
      playing: true,
      playbackRate: 2,
    })
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([seed('mf-1')]),
        'replace',
      )
    let propertiesAttempts = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.pathname.endsWith('/tgsequence')) {
        return jsonResponse({
          type: 'TemporalGeometrySequence',
          geometrySequence: [rawGeometry('tg-2', 10)],
          numberMatched: 3,
          numberReturned: 1,
        })
      }
      propertiesAttempts += 1
      return propertiesAttempts === 1
        ? Promise.reject(new TypeError('Properties offline.'))
        : jsonResponse({
            temporalProperties: [],
            numberMatched: 1,
            numberReturned: 0,
          })
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeatureTemporalPaginationStore.getState().loadMore('mf-1')
    expect(stateFor('mf-1')).toMatchObject({
      geometry: { offset: 2, error: undefined },
      properties: { offset: 1 },
    })
    expect(stateFor('mf-1').properties.error).toContain('offline')
    const requestCount = fetchMock.mock.calls.length
    await useFeatureTemporalPaginationStore.getState().loadMore('mf-1')
    expect(fetchMock).toHaveBeenCalledTimes(requestCount + 1)
    expect(requestUrl(fetchMock.mock.calls.at(-1)?.[0]).pathname).toContain(
      '/tproperties',
    )
    expect(useFeatureStore.getState().selectedFeatureId).toBe('mf-1')
    expect(useTimeStore.getState()).toMatchObject({
      currentTime: Date.parse('2026-01-01T10:00:30Z'),
      playing: true,
      playbackRate: 2,
    })
  })

  it('requests only the unfinished resource and sends nothing when complete', async () => {
    const onlyGeometry = seed('mf-1')
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore.getState().installFromCollection(
      'http://localhost:5050',
      'routes',
      result([
        {
          ...onlyGeometry,
          properties: { ...onlyGeometry.properties, hasMore: false },
        },
      ]),
      'replace',
    )
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input
      return jsonResponse({
        type: 'TemporalGeometrySequence',
        geometrySequence: [],
        numberMatched: 1,
        numberReturned: 0,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeatureTemporalPaginationStore.getState().loadMore('mf-1')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(requestUrl(fetchMock.mock.calls[0]?.[0]).pathname).toContain(
      '/tgsequence',
    )
    await useFeatureTemporalPaginationStore.getState().loadMore('mf-1')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('retains successful properties when geometry fails', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([seed('mf-1')]),
        'replace',
      )
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        requestUrl(input).pathname.endsWith('/tgsequence')
          ? Promise.reject(new TypeError('Geometry offline.'))
          : jsonResponse({
              temporalProperties: [rawPropertyGroup(10)],
              numberMatched: 2,
              numberReturned: 1,
            }),
      ),
    )

    await useFeatureTemporalPaginationStore.getState().loadMore('mf-1')

    expect(stateFor('mf-1')).toMatchObject({
      geometry: { offset: 1 },
      properties: { offset: 2, hasMore: false, error: undefined },
    })
    expect(stateFor('mf-1').geometry.error).toContain('offline')
    expect(
      useFeatureStore.getState().features[0]?.temporalProperties,
    ).toHaveLength(2)
  })
})
