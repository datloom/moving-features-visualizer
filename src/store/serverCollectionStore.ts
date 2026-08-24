import { create } from 'zustand'

import { MovingFeaturesApiClient } from '../services/moving-features-api/MovingFeaturesApiClient'
import { MovingFeaturesApiDataSource } from '../services/moving-features-api/MovingFeaturesApiDataSource'
import type {
  CollectionLoadResult,
  DateTimeInterval,
} from '../services/moving-features-api/types'
import { loadMovingFeatures } from '../services/loadMovingFeatures'
import { useFeatureStore } from './featureStore'

export interface ServerCollectionSession {
  readonly baseUrl: string
  readonly collectionId: string
  readonly collectionTitle: string
  readonly datetime?: DateTimeInterval
  readonly limit: number
  readonly serverPosition: number
  readonly numberMatched?: number
  readonly numberLoaded: number
  readonly failureCount: number
  readonly hasMore: boolean
  readonly nextHref?: string
}

interface ServerCollectionState {
  readonly session?: ServerCollectionSession
  readonly loadingMore: boolean
  readonly error?: string
  installSession: (
    session: Omit<
      ServerCollectionSession,
      | 'serverPosition'
      | 'numberLoaded'
      | 'failureCount'
      | 'hasMore'
      | 'nextHref'
    >,
    result: CollectionLoadResult,
  ) => void
  clearSession: () => void
  loadMore: () => Promise<void>
}

export const hasMoreServerFeatures = (
  serverPosition: number,
  numberMatched: number | undefined,
  nextHref: string | undefined,
): boolean =>
  nextHref !== undefined ||
  (numberMatched !== undefined && serverPosition < numberMatched)

const nextLink = (result: CollectionLoadResult) => result.pagination.next?.href

export const useServerCollectionStore = create<ServerCollectionState>(
  (set, get) => ({
    session: undefined,
    loadingMore: false,
    error: undefined,
    installSession: (base, result) => {
      const returned = result.pagination.numberReturned ?? 0
      const serverPosition = returned
      const nextHref = nextLink(result)
      set({
        loadingMore: false,
        error: undefined,
        session: {
          ...base,
          serverPosition,
          numberMatched: result.pagination.numberMatched,
          numberLoaded: useFeatureStore.getState().features.length,
          failureCount: result.failures.length,
          hasMore: hasMoreServerFeatures(
            serverPosition,
            result.pagination.numberMatched,
            nextHref,
          ),
          nextHref,
        },
      })
    },
    clearSession: () =>
      set({ session: undefined, loadingMore: false, error: undefined }),
    loadMore: async () => {
      const current = get()
      if (!current.session || current.loadingMore || !current.session.hasMore)
        return
      const session = current.session
      set({ loadingMore: true, error: undefined })
      const source = new MovingFeaturesApiDataSource(
        new MovingFeaturesApiClient(session.baseUrl),
        session.collectionId,
        {
          limit: session.limit,
          offset: session.serverPosition,
          datetime: session.datetime,
        },
      )
      const loaded = await loadMovingFeatures(source, { mode: 'append' })
      if (!loaded.success) {
        set({ loadingMore: false, error: loaded.error.message })
        return
      }
      const result = source.loadResult
      if (!result) {
        set({
          loadingMore: false,
          error: 'The server page returned no loading summary.',
        })
        return
      }
      const returned = result.pagination.numberReturned ?? 0
      const serverPosition = session.serverPosition + returned
      const nextHref = nextLink(result)
      set({
        loadingMore: false,
        error: undefined,
        session: {
          ...session,
          serverPosition,
          numberMatched:
            result.pagination.numberMatched ?? session.numberMatched,
          numberLoaded: useFeatureStore.getState().features.length,
          failureCount: session.failureCount + result.failures.length,
          hasMore: hasMoreServerFeatures(
            serverPosition,
            result.pagination.numberMatched ?? session.numberMatched,
            nextHref,
          ),
          nextHref,
        },
      })
    },
  }),
)
