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
  queryRangeMode: 'fixed',
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

const caughtUpSeed = (
  featureId = 'mf-1',
  mode: FeatureTemporalPaginationSeed['queryRangeMode'] = 'fixed',
): FeatureTemporalPaginationSeed => ({
  ...seed(featureId),
  queryRangeMode: mode,
  geometry: {
    ...seed(featureId).geometry,
    offset: 50,
    numberMatched: 50,
    numberReturned: 10,
    hasMore: false,
  },
  properties: {
    ...seed(featureId).properties,
    offset: 20,
    numberMatched: 20,
    numberReturned: 4,
    hasMore: false,
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

  it('refreshes caught-up cursors with no new data and keeps fixed datetime bounds', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([caughtUpSeed()]),
        'replace',
      )
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      return url.pathname.endsWith('/tgsequence')
        ? jsonResponse({
            type: 'TemporalGeometrySequence',
            geometrySequence: [],
            numberMatched: 50,
            numberReturned: 0,
          })
        : jsonResponse({
            temporalProperties: [],
            numberMatched: 20,
            numberReturned: 0,
          })
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeatureTemporalPaginationStore.getState().refresh('mf-1')

    expect(stateFor('mf-1')).toMatchObject({
      datetime: { start, end },
      geometry: { offset: 50, numberMatched: 50, hasMore: false },
      properties: { offset: 20, numberMatched: 20, hasMore: false },
      lastRefreshResult: 'no-new-data',
      refreshing: false,
    })
    const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input))
    expect(urls).toHaveLength(2)
    expect(urls.map((url) => url.searchParams.get('offset'))).toEqual([
      '50',
      '20',
    ])
    expect(
      urls.every(
        (url) => url.searchParams.get('datetime') === `${start}/${end}`,
      ),
    ).toBe(true)
  })

  it('switches from refresh back to normal pagination when multiple new pages exist', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([caughtUpSeed()]),
        'replace',
      )
    let geometryRequest = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input)
        if (url.pathname.endsWith('/tproperties')) {
          return jsonResponse({
            temporalProperties: [],
            numberMatched: 20,
            numberReturned: 0,
          })
        }
        geometryRequest += 1
        const count = geometryRequest === 1 ? 10 : 7
        const firstId = geometryRequest === 1 ? 51 : 61
        return jsonResponse({
          type: 'TemporalGeometrySequence',
          geometrySequence: Array.from({ length: count }, (_, index) =>
            rawGeometry(
              `tg-${firstId + index}`,
              (geometryRequest === 1 ? 10 : 30) + index,
            ),
          ),
          numberMatched: 67,
          numberReturned: count,
        })
      }),
    )

    await useFeatureTemporalPaginationStore.getState().refresh('mf-1')
    expect(stateFor('mf-1').geometry).toMatchObject({
      offset: 60,
      numberMatched: 67,
      hasMore: true,
    })
    await useFeatureTemporalPaginationStore.getState().loadMore('mf-1')
    expect(stateFor('mf-1').geometry).toMatchObject({
      offset: 67,
      numberMatched: 67,
      hasMore: false,
    })
    expect(
      useFeatureStore.getState().features[0]?.temporalGeometry.segments,
    ).toHaveLength(18)
  })

  it('moves a caught-up geometry cursor from 50/50 to 51/51 exactly once', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([caughtUpSeed()]),
        'replace',
      )
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        requestUrl(input).pathname.endsWith('/tgsequence')
          ? jsonResponse({
              type: 'TemporalGeometrySequence',
              geometrySequence: [rawGeometry('tg-51', 10)],
              numberMatched: 51,
              numberReturned: 1,
            })
          : jsonResponse({
              temporalProperties: [],
              numberMatched: 20,
              numberReturned: 0,
            }),
      ),
    )

    await useFeatureTemporalPaginationStore.getState().refresh('mf-1')

    expect(stateFor('mf-1')).toMatchObject({
      geometry: { offset: 51, numberMatched: 51, hasMore: false },
      lastRefreshResult: 'new-data',
    })
    expect(
      useFeatureStore.getState().features[0]?.temporalGeometry.segments,
    ).toHaveLength(2)
  })

  it('expands a source-derived end from refreshed metadata without resetting cursors', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([caughtUpSeed('mf-1', 'source-derived')]),
        'replace',
      )
    const expandedEnd = '2026-01-01T11:05:00Z'
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.pathname.endsWith('/items/mf-1')) {
        return jsonResponse({
          id: 'mf-1',
          type: 'Feature',
          time: [start, expandedEnd],
          properties: {},
        })
      }
      return url.pathname.endsWith('/tgsequence')
        ? jsonResponse({
            type: 'TemporalGeometrySequence',
            geometrySequence: [],
            numberMatched: 50,
            numberReturned: 0,
          })
        : jsonResponse({
            temporalProperties: [],
            numberMatched: 20,
            numberReturned: 0,
          })
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeatureTemporalPaginationStore.getState().refresh('mf-1')

    expect(stateFor('mf-1')).toMatchObject({
      datetime: { start, end: expandedEnd },
      geometry: { offset: 50 },
      properties: { offset: 20 },
    })
    const childUrls = fetchMock.mock.calls
      .map(([input]) => requestUrl(input))
      .filter((url) => /tgsequence|tproperties/.test(url.pathname))
    expect(
      childUrls.every(
        (url) => url.searchParams.get('datetime') === `${start}/${expandedEnd}`,
      ),
    ).toBe(true)
  })

  it('preserves a successful refresh resource and retries only the failed one', async () => {
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
        result([caughtUpSeed()]),
        'replace',
      )
    let propertiesAttempts = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.pathname.endsWith('/tgsequence')) {
        return jsonResponse({
          type: 'TemporalGeometrySequence',
          geometrySequence: [rawGeometry('tg-51', 10)],
          numberMatched: 51,
          numberReturned: 1,
        })
      }
      propertiesAttempts += 1
      return propertiesAttempts === 1
        ? Promise.reject(new TypeError('Properties refresh failed.'))
        : jsonResponse({
            temporalProperties: [],
            numberMatched: 20,
            numberReturned: 0,
          })
    })
    vi.stubGlobal('fetch', fetchMock)

    await useFeatureTemporalPaginationStore.getState().refresh('mf-1')
    expect(stateFor('mf-1').geometry).toMatchObject({
      offset: 51,
      numberMatched: 51,
    })
    expect(stateFor('mf-1').properties.offset).toBe(20)
    expect(stateFor('mf-1').properties.error).toContain('failed')
    const geometryCalls = () =>
      fetchMock.mock.calls.filter(([input]) =>
        requestUrl(input).pathname.endsWith('/tgsequence'),
      ).length
    expect(geometryCalls()).toBe(1)
    await useFeatureTemporalPaginationStore.getState().refresh('mf-1')
    expect(geometryCalls()).toBe(1)
    expect(propertiesAttempts).toBe(2)
    expect(useFeatureStore.getState().selectedFeatureId).toBe('mf-1')
    expect(useTimeStore.getState()).toMatchObject({
      currentTime: Date.parse('2026-01-01T10:00:30Z'),
      playing: true,
      playbackRate: 2,
    })
  })

  it('preserves newly refreshed properties when geometry refresh fails', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([caughtUpSeed()]),
        'replace',
      )
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        requestUrl(input).pathname.endsWith('/tgsequence')
          ? Promise.reject(new TypeError('Geometry refresh failed.'))
          : jsonResponse({
              temporalProperties: [rawPropertyGroup(10)],
              numberMatched: 21,
              numberReturned: 1,
            }),
      ),
    )

    await useFeatureTemporalPaginationStore.getState().refresh('mf-1')

    expect(stateFor('mf-1').geometry.offset).toBe(50)
    expect(stateFor('mf-1').geometry.error).toContain('failed')
    expect(stateFor('mf-1').properties).toMatchObject({
      offset: 21,
      numberMatched: 21,
      hasMore: false,
    })
    expect(
      useFeatureStore.getState().features[0]?.temporalProperties,
    ).toHaveLength(2)
  })

  it('ignores a source-derived refresh after query replacement', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes-a',
        result([caughtUpSeed('mf-1', 'source-derived')]),
        'replace',
      )
    let resolveMetadata: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveMetadata = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const refresh = useFeatureTemporalPaginationStore.getState().refresh('mf-1')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes-b',
        result([caughtUpSeed('mf-1')]),
        'replace',
      )
    resolveMetadata?.(
      new Response(
        JSON.stringify({
          id: 'mf-1',
          type: 'Feature',
          time: [start, '2026-01-01T11:10:00Z'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    await refresh

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(stateFor('mf-1')).toMatchObject({
      collectionId: 'routes-b',
      datetime: { start, end },
    })
  })

  it('preserves data when server totals regress behind the consumed cursor', async () => {
    useFeatureStore.getState().replaceFeatures([feature('mf-1')])
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        result([caughtUpSeed()]),
        'replace',
      )
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) =>
        requestUrl(input).pathname.endsWith('/tgsequence')
          ? jsonResponse({
              type: 'TemporalGeometrySequence',
              geometrySequence: [],
              numberMatched: 49,
              numberReturned: 0,
            })
          : jsonResponse({
              temporalProperties: [],
              numberMatched: 20,
              numberReturned: 0,
            }),
      ),
    )

    await useFeatureTemporalPaginationStore.getState().refresh('mf-1')

    expect(stateFor('mf-1').geometry.offset).toBe(50)
    expect(stateFor('mf-1').geometry.numberMatched).toBe(50)
    expect(stateFor('mf-1').geometry.error).toContain(
      'pagination became inconsistent',
    )
    expect(
      useFeatureStore.getState().features[0]?.temporalGeometry.segments,
    ).toHaveLength(1)
  })
})
