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

  it('serializes a child datetime interval once with quotes and no leading space', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ type: 'TemporalGeometrySequence', geometrySequence: [] }),
      )
    const client = new MovingFeaturesApiClient(
      'http://localhost:5050',
      fetchMock,
    )
    await client.getTemporalGeometry('routes', 'mf/1', {
      limit: 1000,
      datetime: { start: '2011-07-14T22:01:01Z', end: '2011-07-15T01:11:22Z' },
    })
    const url = fetchMock.mock.calls[0]![0] as URL
    expect(url.searchParams.get('datetime')).toBe(
      '"2011-07-14T22:01:01Z/2011-07-15T01:11:22Z"',
    )
    expect(url.pathname).toContain('mf%2F1/tgsequence')
    expect(
      serializeDateTimeInterval({
        start: '2011-07-14T22:01:01Z',
        end: '2011-07-15T01:11:22Z',
      }),
    ).toBe('"2011-07-14T22:01:01Z/2011-07-15T01:11:22Z"')
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
})
