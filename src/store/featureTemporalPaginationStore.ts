import { create } from 'zustand'

import { normalizeMovingFeature } from '../mfjson/normalizer'
import { validateMfJson } from '../mfjson/validator'
import { MovingFeaturesApiClient } from '../services/moving-features-api/MovingFeaturesApiClient'
import type {
  ApiLink,
  CollectionLoadResult,
  DateTimeInterval,
  FeatureMetadata,
  FeatureTemporalPaginationSeed,
} from '../services/moving-features-api/types'
import { getDatasetTimeRange } from '../services/datasetTimeRange'
import { useFeatureStore } from './featureStore'
import { useTimeStore } from './timeStore'

export type TemporalResourceKind = 'geometry' | 'properties'

export interface TemporalResourcePaginationState {
  readonly offset: number
  readonly limit: number
  readonly numberMatched?: number
  readonly numberReturned?: number
  readonly hasMore: boolean
  readonly nextHref?: string
  readonly loading: boolean
  readonly error?: string
}

export interface FeatureTemporalPaginationState {
  readonly featureId: string
  readonly baseUrl: string
  readonly collectionId: string
  readonly queryKey: string
  readonly datetime: DateTimeInterval
  readonly metadata: FeatureMetadata
  readonly normalizationGeometry: unknown
  readonly geometryKeys: readonly string[]
  readonly propertyGroupKeys: readonly string[]
  readonly geometry: TemporalResourcePaginationState
  readonly properties: TemporalResourcePaginationState
}

interface FeatureTemporalPaginationStore {
  readonly features: Readonly<Record<string, FeatureTemporalPaginationState>>
  installFromCollection: (
    baseUrl: string,
    collectionId: string,
    result: CollectionLoadResult,
    mode: 'replace' | 'append',
  ) => void
  clear: () => void
  loadMore: (featureId: string) => Promise<void>
}

const queryKey = (
  baseUrl: string,
  collectionId: string,
  datetime: DateTimeInterval,
) => `${baseUrl}|${collectionId}|${datetime.start}/${datetime.end}`

const resourceState = (
  seed: FeatureTemporalPaginationSeed['geometry'],
): TemporalResourcePaginationState => ({
  offset: seed.offset,
  limit: seed.limit,
  numberMatched: seed.numberMatched,
  numberReturned: seed.numberReturned,
  hasMore: seed.hasMore,
  nextHref: seed.next?.href,
  loading: false,
  error: seed.error,
})

const staticMetadata = (metadata: FeatureMetadata) =>
  Object.fromEntries(
    Object.entries(metadata).filter(([name]) => name !== 'geometry'),
  )

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const geometryKey = (value: unknown): string =>
  isRecord(value) && typeof value.id === 'string'
    ? `id:${value.id}`
    : `content:${JSON.stringify(value)}`

const propertyGroupKey = (value: unknown): string =>
  `content:${JSON.stringify(value)}`

const unseenValues = (
  values: readonly unknown[],
  existingKeys: readonly string[],
  keyOf: (value: unknown) => string,
) => {
  const keys = new Set(existingKeys)
  const additions: unknown[] = []
  for (const value of values) {
    const key = keyOf(value)
    if (keys.has(key)) continue
    keys.add(key)
    additions.push(value)
  }
  return { additions, keys: [...keys] }
}

const normalizePage = (
  metadata: FeatureMetadata,
  geometry: readonly unknown[],
  temporalProperties: readonly unknown[],
) => {
  const assembled = {
    ...staticMetadata(metadata),
    temporalGeometry: geometry,
    temporalProperties,
  }
  const validation = validateMfJson(assembled)
  if (!validation.valid) {
    throw new Error(
      validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join(' '),
    )
  }
  const normalized = normalizeMovingFeature(assembled)
  if (!normalized.success) {
    throw new Error(
      normalized.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join(' '),
    )
  }
  return normalized.data
}

const validateCount = (
  value: number | undefined,
  fallback: number,
  name: string,
): number => {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`)
  }
  return value
}

const nextResourceState = (
  previous: TemporalResourcePaginationState,
  numberReturned: number,
  numberMatched: number | undefined,
  links: readonly ApiLink[] | undefined,
): TemporalResourcePaginationState => {
  const offset = previous.offset + numberReturned
  const nextHref = links?.find(({ rel }) => rel === 'next')?.href
  const matched = numberMatched ?? previous.numberMatched
  return {
    ...previous,
    offset,
    numberMatched: matched,
    numberReturned,
    nextHref,
    hasMore:
      nextHref !== undefined || (matched !== undefined && offset < matched),
    loading: false,
    error: undefined,
  }
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Temporal resource loading failed.'

export const useFeatureTemporalPaginationStore =
  create<FeatureTemporalPaginationStore>((set, get) => ({
    features: {},
    installFromCollection: (baseUrl, collectionId, result, mode) =>
      set((state) => {
        const features = mode === 'replace' ? {} : { ...state.features }
        for (const seed of result.temporalPagination ?? []) {
          features[seed.featureId] = {
            featureId: seed.featureId,
            baseUrl,
            collectionId,
            queryKey: queryKey(baseUrl, collectionId, seed.datetime),
            datetime: seed.datetime,
            metadata: seed.metadata,
            normalizationGeometry: seed.normalizationGeometry,
            geometryKeys: seed.geometryKeys,
            propertyGroupKeys: seed.propertyGroupKeys,
            geometry: resourceState(seed.geometry),
            properties: resourceState(seed.properties),
          }
        }
        return { features }
      }),
    clear: () => set({ features: {} }),
    loadMore: async (featureId) => {
      const initial = get().features[featureId]
      if (!initial) return
      const kinds = ['geometry', 'properties'] as const
      const retries = kinds.filter(
        (kind) =>
          initial[kind].hasMore &&
          !initial[kind].loading &&
          initial[kind].error !== undefined,
      )
      const resources =
        retries.length > 0
          ? retries
          : kinds.filter(
              (kind) => initial[kind].hasMore && !initial[kind].loading,
            )
      if (resources.length === 0) return

      set((state) => {
        const feature = state.features[featureId]
        if (!feature || feature.queryKey !== initial.queryKey) return state
        const update = Object.fromEntries(
          resources.map((kind) => [
            kind,
            { ...feature[kind], loading: true, error: undefined },
          ]),
        ) as Partial<
          Pick<FeatureTemporalPaginationState, 'geometry' | 'properties'>
        >
        return {
          features: {
            ...state.features,
            [featureId]: { ...feature, ...update },
          },
        }
      })

      const client = new MovingFeaturesApiClient(initial.baseUrl)
      const loadResource = async (kind: TemporalResourceKind) => {
        const previous = initial[kind]
        try {
          if (kind === 'geometry') {
            const response = await client.getTemporalGeometry(
              initial.collectionId,
              featureId,
              {
                datetime: initial.datetime,
                limit: previous.limit,
                offset: previous.offset,
              },
            )
            if (
              response.type !== 'TemporalGeometrySequence' ||
              !Array.isArray(response.geometrySequence)
            ) {
              throw new Error('Temporal geometry response is malformed.')
            }
            const returned = validateCount(
              response.numberReturned,
              response.geometrySequence.length,
              'Temporal geometry numberReturned',
            )
            if (get().features[featureId]?.queryKey !== initial.queryKey) return
            const uniqueGeometry = unseenValues(
              response.geometrySequence,
              initial.geometryKeys,
              geometryKey,
            )
            const normalized =
              uniqueGeometry.additions.length === 0
                ? undefined
                : normalizePage(initial.metadata, uniqueGeometry.additions, [])
            if (normalized) {
              useFeatureStore
                .getState()
                .appendTemporalData(
                  featureId,
                  normalized.temporalGeometry.segments,
                  [],
                )
            }
            set((state) => {
              const feature = state.features[featureId]
              if (!feature || feature.queryKey !== initial.queryKey)
                return state
              return {
                features: {
                  ...state.features,
                  [featureId]: {
                    ...feature,
                    geometryKeys: uniqueGeometry.keys,
                    geometry: nextResourceState(
                      feature.geometry,
                      returned,
                      response.numberMatched,
                      response.links,
                    ),
                  },
                },
              }
            })
          } else {
            const response = await client.getTemporalProperties(
              initial.collectionId,
              featureId,
              {
                datetime: initial.datetime,
                limit: previous.limit,
                offset: previous.offset,
              },
            )
            if (!Array.isArray(response.temporalProperties)) {
              throw new Error('Temporal properties response is malformed.')
            }
            const returned = validateCount(
              response.numberReturned,
              response.temporalProperties.length,
              'Temporal properties numberReturned',
            )
            if (get().features[featureId]?.queryKey !== initial.queryKey) return
            const uniqueProperties = unseenValues(
              response.temporalProperties,
              initial.propertyGroupKeys,
              propertyGroupKey,
            )
            const normalized =
              uniqueProperties.additions.length === 0
                ? undefined
                : normalizePage(
                    initial.metadata,
                    [initial.normalizationGeometry],
                    uniqueProperties.additions,
                  )
            if (normalized) {
              useFeatureStore
                .getState()
                .appendTemporalData(
                  featureId,
                  [],
                  normalized.temporalProperties,
                )
            }
            set((state) => {
              const feature = state.features[featureId]
              if (!feature || feature.queryKey !== initial.queryKey)
                return state
              return {
                features: {
                  ...state.features,
                  [featureId]: {
                    ...feature,
                    propertyGroupKeys: uniqueProperties.keys,
                    properties: nextResourceState(
                      feature.properties,
                      returned,
                      response.numberMatched,
                      response.links,
                    ),
                  },
                },
              }
            })
          }
        } catch (error) {
          set((state) => {
            const feature = state.features[featureId]
            if (!feature || feature.queryKey !== initial.queryKey) return state
            return {
              features: {
                ...state.features,
                [featureId]: {
                  ...feature,
                  [kind]: {
                    ...feature[kind],
                    loading: false,
                    error: errorMessage(error),
                  },
                },
              },
            }
          })
        }
      }

      await Promise.all(resources.map(loadResource))
      const range = getDatasetTimeRange(useFeatureStore.getState().features)
      if (range)
        useTimeStore.getState().setRange(range.startTime, range.endTime)
    },
  }))
