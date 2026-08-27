import { afterEach, describe, expect, it, vi } from 'vitest'

import { MovingFeaturesApiError } from './errors'
import {
  MovingFeaturesApiClient,
  serializeDateTimeInterval,
} from './MovingFeaturesApiClient'

const response = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

describe('MovingFeaturesApiClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the default browser fetch adapter without invoking fetch as a client method', async () => {
    const nativeFetchLike = vi.fn(function (this: unknown) {
      if (this instanceof MovingFeaturesApiClient) {
        throw new TypeError('Illegal invocation')
      }
      return Promise.resolve(response({ collections: [] }))
    })
    vi.stubGlobal('fetch', nativeFetchLike)

    const client = new MovingFeaturesApiClient('http://localhost:5050')
    await expect(client.getCollections()).resolves.toEqual({
      collections: [],
      links: undefined,
    })
    expect(nativeFetchLike).toHaveBeenCalledOnce()
  })

  it('retrieves only explicitly typed Moving Feature collections', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        collections: [
          { id: 'usable', itemType: 'movingfeature', title: 'Routes' },
          { id: 'static', itemType: 'feature' },
          { id: 'missing' },
          { id: 'null', itemType: null },
        ],
      }),
    )
    const result = await new MovingFeaturesApiClient(
      'http://localhost:5050',
      fetchMock,
    ).getCollections()

    expect(result.collections.map(({ id }) => id)).toEqual(['usable'])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/collections' }),
      { headers: { Accept: 'application/json' } },
    )
  })

  it.each([1, 1000])('accepts boundary feature limit %s', async (limit) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ type: 'FeatureCollection', features: [] }))
    await new MovingFeaturesApiClient(
      'http://localhost:5050',
      fetchMock,
    ).getFeatures('routes', { limit })
    expect((fetchMock.mock.calls[0]![0] as URL).searchParams.get('limit')).toBe(
      String(limit),
    )
  })

  it('serializes a validated Feature offset with URLSearchParams', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ type: 'FeatureCollection', features: [] }))
    await new MovingFeaturesApiClient(
      'http://localhost:5050',
      fetchMock,
    ).getFeatures('routes', { limit: 10, offset: 20 })

    expect(
      (fetchMock.mock.calls[0]![0] as URL).searchParams.get('offset'),
    ).toBe('20')
  })

  it.each([-1, 1.5, Number.NaN])(
    'rejects invalid Feature offset %s',
    async (offset) => {
      await expect(
        new MovingFeaturesApiClient(
          'http://localhost:5050',
          vi.fn(),
        ).getFeatures('routes', { limit: 10, offset }),
      ).rejects.toThrow(RangeError)
    },
  )

  it.each([0, 1001, 1.5, Number.NaN])(
    'rejects invalid feature limit %s',
    async (limit) => {
      const client = new MovingFeaturesApiClient(
        'http://localhost:5050',
        vi.fn(),
      )
      await expect(client.getFeatures('routes', { limit })).rejects.toThrow(
        RangeError,
      )
    },
  )

  it('serializes collection and child datetime intervals without quotes or whitespace', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ type: 'FeatureCollection', features: [] }),
      )
      .mockResolvedValueOnce(
        response({ type: 'TemporalGeometrySequence', geometrySequence: [] }),
      )
      .mockResolvedValueOnce(response({ temporalProperties: [] }))
    const client = new MovingFeaturesApiClient(
      'http://localhost:5050',
      fetchMock,
    )
    const datetime = {
      start: ' 2011-07-14T22:01:01Z ',
      end: '\t2011-07-15T01:11:22Z\n',
    }
    await client.getFeatures('routes', { limit: 100, datetime })
    await client.getTemporalGeometry('routes', 'mf/1', {
      limit: 1000,
      datetime,
    })
    await client.getTemporalProperties('routes', 'mf/1', { datetime })

    const urls = fetchMock.mock.calls.map(([input]) => input as URL)
    expect(urls.map(({ pathname }) => pathname)).toEqual([
      '/collections/routes/items',
      '/collections/routes/items/mf%2F1/tgsequence',
      '/collections/routes/items/mf%2F1/tproperties',
    ])
    for (const url of urls) {
      const value = url.searchParams.get('datetime')
      expect(value).toBe('2011-07-14T22:01:01Z/2011-07-15T01:11:22Z')
      expect(value).not.toContain('"')
      expect(value).toBe(value?.trim())
      expect(url.toString()).not.toContain('%22')
    }
    expect(
      serializeDateTimeInterval({
        start: ' 2011-07-14T22:01:01Z ',
        end: '2011-07-15T01:11:22Z ',
      }),
    ).toBe('2011-07-14T22:01:01Z/2011-07-15T01:11:22Z')
  })

  it.each([
    [
      'collection request failure',
      vi.fn().mockRejectedValue(new TypeError('CORS')),
    ],
    ['HTTP 4xx', vi.fn().mockResolvedValue(response({}, { status: 404 }))],
    ['HTTP 5xx', vi.fn().mockResolvedValue(response({}, { status: 500 }))],
    [
      'malformed JSON',
      vi.fn().mockResolvedValue(new Response('{', { status: 200 })),
    ],
  ])('reports %s', async (_name, fetchMock) => {
    await expect(
      new MovingFeaturesApiClient(
        'http://localhost:5050',
        fetchMock,
      ).getCollections(),
    ).rejects.toBeInstanceOf(MovingFeaturesApiError)
  })

  it('rejects malformed collection and item response shapes', async () => {
    const collectionsClient = new MovingFeaturesApiClient(
      'http://localhost:5050',
      vi.fn().mockResolvedValue(response({})),
    )
    await expect(collectionsClient.getCollections()).rejects.toMatchObject({
      kind: 'invalid-response',
    })
    const itemsClient = new MovingFeaturesApiClient(
      'http://localhost:5050',
      vi.fn().mockResolvedValue(response({ type: 'FeatureCollection' })),
    )
    await expect(
      itemsClient.getFeatures('routes', { limit: 10 }),
    ).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('validates refreshed Feature metadata used by source-derived ranges', async () => {
    const valid = {
      id: 'mf-1',
      type: 'Feature',
      time: ['2026-01-01T10:00:00Z', '2026-01-01T11:05:00Z'],
    }
    await expect(
      new MovingFeaturesApiClient(
        'http://localhost:5050',
        vi.fn().mockResolvedValue(response(valid)),
      ).getFeature('routes', 'mf-1'),
    ).resolves.toEqual(valid)
    await expect(
      new MovingFeaturesApiClient(
        'http://localhost:5050',
        vi.fn().mockResolvedValue(response({ id: 'mf-1', type: 'Feature' })),
      ).getFeature('routes', 'mf-1'),
    ).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('classifies a lost fetch invocation context as a client error', async () => {
    const detachedFetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Illegal invocation'))

    await expect(
      new MovingFeaturesApiClient(
        'http://localhost:5050',
        detachedFetch,
      ).getCollections(),
    ).rejects.toMatchObject({
      kind: 'client',
      message:
        'Moving Features API request could not start because the fetch adapter lost its browser invocation context.',
    })
  })

  describe('getTemporalGeometryMetric', () => {
    const validMetricResponse = (name: string) => ({
      name,
      type: 'TReal',
      form: 'KMH',
      valueSequence: [
        {
          datetimes: ['2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z'],
          values: [1, 2],
          interpolation: 'Linear',
        },
      ],
    })

    const baseRequest = {
      collectionId: 'routes',
      mFeatureId: 'mf/1',
      tGeometryId: 'tg-1',
      startTime: Date.parse('2026-01-01T10:00:00Z'),
      endTime: Date.parse('2026-01-01T10:05:00Z'),
    } as const

    it.each([
      ['velocity', '/collections/routes/items/mf%2F1/tgsequence/tg-1/velocity'],
      [
        'acceleration',
        '/collections/routes/items/mf%2F1/tgsequence/tg-1/acceleration',
      ],
      ['distance', '/collections/routes/items/mf%2F1/tgsequence/tg-1/distance'],
    ] as const)('requests the %s endpoint via GET', async (metric, path) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(response(validMetricResponse(metric)))
      const client = new MovingFeaturesApiClient(
        'http://localhost:5050',
        fetchMock,
      )
      await client.getTemporalGeometryMetric({ ...baseRequest, metric })

      const [url, init] = fetchMock.mock.calls[0]! as [URL, RequestInit]
      expect(url.pathname).toBe(path)
      // GET is the implicit default here, matching every other read in this
      // client — no `method` override, no request body.
      expect(init.method).toBeUndefined()
      expect(init).not.toHaveProperty('body')
    })

    it('sends the datetime interval as start/end with no literal quotes', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(response(validMetricResponse('velocity')))
      const client = new MovingFeaturesApiClient(
        'http://localhost:5050',
        fetchMock,
      )
      await client.getTemporalGeometryMetric({
        ...baseRequest,
        metric: 'velocity',
      })

      const [url] = fetchMock.mock.calls[0]! as [URL]
      const value = url.searchParams.get('datetime')
      expect(value).toBe('2026-01-01T10:00:00.000Z/2026-01-01T10:05:00.000Z')
      expect(value).not.toContain('"')
    })

    it('returns a validated response for a well-formed payload', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(response(validMetricResponse('acceleration')))
      const client = new MovingFeaturesApiClient(
        'http://localhost:5050',
        fetchMock,
      )
      await expect(
        client.getTemporalGeometryMetric({
          ...baseRequest,
          metric: 'acceleration',
        }),
      ).resolves.toEqual(validMetricResponse('acceleration'))
    })

    it('builds the exact request URL/method/headers for a real-world example', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(response(validMetricResponse('velocity')))
      const client = new MovingFeaturesApiClient(
        'http://localhost:5050',
        fetchMock,
      )
      await client.getTemporalGeometryMetric({
        collectionId: 'b71a9504-8872-4c47-a387-907feaa9d738',
        mFeatureId: '0e21f2eb-7bd6-4731-a0ed-ad07fff66561',
        tGeometryId: 'de95d397-ffc7-4ae9-a730-4211757add8c',
        metric: 'velocity',
        startTime: Date.parse('2023-11-20T13:30:00Z'),
        endTime: Date.parse('2023-11-20T13:33:00Z'),
      })

      const [url, init] = fetchMock.mock.calls[0]! as [URL, RequestInit]
      expect(url.toString()).toBe(
        'http://localhost:5050/collections/b71a9504-8872-4c47-a387-907feaa9d738' +
          '/items/0e21f2eb-7bd6-4731-a0ed-ad07fff66561' +
          '/tgsequence/de95d397-ffc7-4ae9-a730-4211757add8c/velocity' +
          // `.toISOString()` includes milliseconds — still valid ISO-8601,
          // and URLSearchParams encodes the value exactly once (`:` -> %3A,
          // `/` -> %2F), never double-encoded and never quoted.
          '?datetime=2023-11-20T13%3A30%3A00.000Z%2F2023-11-20T13%3A33%3A00.000Z',
      )
      expect(init.method).toBeUndefined() // GET is the implicit default.
      expect(init.headers).toEqual({ Accept: 'application/json' })
      const datetimeValue = url.searchParams.get('datetime')!
      expect(datetimeValue).toBe(
        '2023-11-20T13:30:00.000Z/2023-11-20T13:33:00.000Z',
      )
      expect(datetimeValue).not.toContain('"')
      expect(url.toString()).not.toContain('%22')
      expect(url.toString()).not.toContain('%25') // no double-encoding
    })

    it.each([
      ['missing name', { ...validMetricResponse('velocity'), name: undefined }],
      [
        'unrecognized type',
        { ...validMetricResponse('velocity'), type: 'TText' },
      ],
      [
        'non-array valueSequence',
        { ...validMetricResponse('velocity'), valueSequence: 'nope' },
      ],
      [
        'mismatched datetimes/values lengths',
        {
          ...validMetricResponse('velocity'),
          valueSequence: [
            {
              datetimes: ['2026-01-01T10:00:00Z'],
              values: [1, 2],
              interpolation: 'Linear',
            },
          ],
        },
      ],
      [
        'non-numeric values',
        {
          ...validMetricResponse('velocity'),
          valueSequence: [
            {
              datetimes: ['2026-01-01T10:00:00Z'],
              values: ['fast'],
              interpolation: 'Linear',
            },
          ],
        },
      ],
      [
        'unrecognized interpolation',
        {
          ...validMetricResponse('velocity'),
          valueSequence: [
            {
              datetimes: ['2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z'],
              values: [1, 2],
              interpolation: 'Quadratic',
            },
          ],
        },
      ],
    ])('rejects a malformed response: %s', async (_name, malformed) => {
      const fetchMock = vi.fn().mockResolvedValue(response(malformed))
      const client = new MovingFeaturesApiClient(
        'http://localhost:5050',
        fetchMock,
      )
      await expect(
        client.getTemporalGeometryMetric({
          ...baseRequest,
          metric: 'velocity',
        }),
      ).rejects.toMatchObject({ kind: 'invalid-response' })
    })
  })
})
