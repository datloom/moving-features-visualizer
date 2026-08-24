import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dataSourceConstructor, loadMovingFeatures, summaries } = vi.hoisted(
  () => ({
    dataSourceConstructor: vi.fn(),
    loadMovingFeatures: vi.fn(),
    summaries: [] as unknown[],
  }),
)

vi.mock('../services/moving-features-api/MovingFeaturesApiClient', () => ({
  MovingFeaturesApiClient: vi.fn(),
}))
vi.mock('../services/moving-features-api/MovingFeaturesApiDataSource', () => ({
  MovingFeaturesApiDataSource: vi.fn(function (
    _client: unknown,
    _collectionId: string,
    options: unknown,
  ) {
    dataSourceConstructor(options)
    return { loadResult: summaries.shift() }
  }),
}))
vi.mock('../services/loadMovingFeatures', () => ({ loadMovingFeatures }))

import type { MovingFeature } from '../mfjson/types'
import type { CollectionLoadResult } from '../services/moving-features-api/types'
import { initialFeatureState, useFeatureStore } from './featureStore'
import {
  hasMoreServerFeatures,
  useServerCollectionStore,
} from './serverCollectionStore'

const feature = (id: string): MovingFeature => ({
  id,
  type: 'MovingFeature',
  temporalGeometry: { segments: [] },
  temporalProperties: [],
  properties: {},
})

const page = (
  numberReturned: number,
  numberMatched = 50,
  failures = 0,
): CollectionLoadResult => ({
  features: [],
  failures: Array.from({ length: failures }, (_, index) => ({
    featureId: `failed-${index}`,
    stage: 'assembly' as const,
    message: 'Invalid Feature.',
    retained: false,
  })),
  pagination: {
    numberMatched,
    numberReturned,
    truncated: numberReturned < numberMatched,
  },
})

const install = (result = page(10)) => {
  useServerCollectionStore.getState().installSession(
    {
      baseUrl: 'http://localhost:5050',
      collectionId: 'routes',
      collectionTitle: 'Routes',
      limit: 10,
      numberMatched: 50,
    },
    result,
  )
}

const requestedOffsets = (): unknown[] =>
  dataSourceConstructor.mock.calls.map((call: unknown[]) => {
    const options = call[0]
    return typeof options === 'object' &&
      options !== null &&
      'offset' in options
      ? options.offset
      : undefined
  })

describe('server collection pagination state', () => {
  beforeEach(() => {
    summaries.length = 0
    vi.clearAllMocks()
    useFeatureStore.setState(initialFeatureState)
    useServerCollectionStore.setState({
      session: undefined,
      loadingMore: false,
      error: undefined,
    })
    loadMovingFeatures.mockResolvedValue({
      success: true,
      features: [],
      timeRange: { startTime: 0, endTime: 0 },
    })
  })

  it('advances offsets by server numberReturned until 50 of 50 are processed', async () => {
    useFeatureStore
      .getState()
      .replaceFeatures(
        Array.from({ length: 10 }, (_, index) => feature(`mf-${index + 1}`)),
      )
    install()
    summaries.push(page(10), page(10), page(10), page(10))

    await useServerCollectionStore.getState().loadMore()
    await useServerCollectionStore.getState().loadMore()
    await useServerCollectionStore.getState().loadMore()
    await useServerCollectionStore.getState().loadMore()

    expect(requestedOffsets()).toEqual([10, 20, 30, 40])
    expect(useServerCollectionStore.getState().session).toMatchObject({
      serverPosition: 50,
      hasMore: false,
    })
  })

  it('advances by metadata count after partial assembly failure', () => {
    useFeatureStore
      .getState()
      .replaceFeatures(
        Array.from({ length: 9 }, (_, index) => feature(`mf-${index + 1}`)),
      )
    install(page(10, 50, 1))

    expect(useServerCollectionStore.getState().session).toMatchObject({
      serverPosition: 10,
      numberLoaded: 9,
      failureCount: 1,
      hasMore: true,
    })
  })

  it('does not advance a failed page and allows retry at the same offset', async () => {
    install()
    summaries.push(page(10), page(10))
    loadMovingFeatures
      .mockResolvedValueOnce({ success: false, error: { message: 'Offline.' } })
      .mockResolvedValueOnce({
        success: true,
        features: [],
        timeRange: { startTime: 0, endTime: 0 },
      })

    await useServerCollectionStore.getState().loadMore()
    expect(useServerCollectionStore.getState()).toMatchObject({
      loadingMore: false,
      error: 'Offline.',
      session: { serverPosition: 10 },
    })
    await useServerCollectionStore.getState().loadMore()
    expect(requestedOffsets()).toEqual([10, 10])
    expect(useServerCollectionStore.getState().session?.serverPosition).toBe(20)
  })

  it('uses next links or server position rather than assembled count for hasMore', () => {
    expect(hasMoreServerFeatures(10, 50, undefined)).toBe(true)
    expect(hasMoreServerFeatures(50, 50, undefined)).toBe(false)
    expect(hasMoreServerFeatures(50, undefined, '/next')).toBe(true)
  })
})
