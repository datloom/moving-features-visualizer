export const DEFAULT_API_BASE_URL = 'http://localhost:5050'
export const DEFAULT_FEATURE_LIMIT = 100
export const MIN_FEATURE_LIMIT = 1
export const MAX_FEATURE_LIMIT = 1000
export const CHILD_RESOURCE_LIMIT = 1000
export const DEFAULT_FEATURE_CONCURRENCY = 6

export interface DateTimeInterval {
  readonly start: string
  readonly end: string
}

export type TemporalQueryRangeMode = 'fixed' | 'source-derived'

export interface FeatureQueryOptions {
  readonly limit: number
  readonly offset?: number
  readonly datetime?: DateTimeInterval
}

export interface ChildResourceQueryOptions {
  readonly limit?: number
  readonly offset?: number
  readonly datetime?: DateTimeInterval
}

export interface ApiLink {
  readonly href: string
  readonly rel: string
  readonly type?: string
  readonly title?: string
}

export interface MovingFeatureCollection {
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly itemType: 'movingfeature'
  readonly updateFrequency?: number
  readonly extent?: {
    readonly spatial?: {
      readonly bbox?: readonly number[]
      readonly crs?: string
    }
    readonly temporal?: {
      readonly interval?: readonly string[]
      readonly trs?: string
    }
  }
  readonly [key: string]: unknown
}

export interface CollectionsResponse {
  readonly collections: readonly MovingFeatureCollection[]
  readonly links?: readonly ApiLink[]
}

export interface FeatureMetadata {
  readonly id: string
  readonly type: 'Feature'
  readonly geometry?: unknown
  readonly properties?: Readonly<Record<string, unknown>>
  readonly bbox?: readonly number[]
  readonly time: readonly [string, string]
  readonly [key: string]: unknown
}

export interface FeaturesResponse {
  readonly type: 'FeatureCollection'
  readonly features: readonly FeatureMetadata[]
  readonly links?: readonly ApiLink[]
  readonly numberMatched?: number
  readonly numberReturned?: number
}

export interface TemporalGeometrySequenceResponse {
  readonly type: 'TemporalGeometrySequence'
  readonly geometrySequence: readonly unknown[]
  readonly links?: readonly ApiLink[]
  readonly numberMatched?: number
  readonly numberReturned?: number
}

export interface TemporalPropertiesResponse {
  readonly temporalProperties: readonly unknown[]
  readonly links?: readonly ApiLink[]
  readonly numberMatched?: number
  readonly numberReturned?: number
}

export interface TemporalResourcePaginationSeed {
  readonly offset: number
  readonly limit: number
  readonly numberMatched?: number
  readonly numberReturned?: number
  readonly next?: ApiLink
  readonly hasMore: boolean
  readonly error?: string
}

export interface FeatureTemporalPaginationSeed {
  readonly featureId: string
  readonly metadata: FeatureMetadata
  readonly datetime: DateTimeInterval
  readonly queryRangeMode: TemporalQueryRangeMode
  readonly normalizationGeometry: unknown
  readonly geometryKeys: readonly string[]
  readonly propertyGroupKeys: readonly string[]
  readonly geometry: TemporalResourcePaginationSeed
  readonly properties: TemporalResourcePaginationSeed
}

export type FeatureLoadFailureStage =
  'metadata' | 'temporal-geometry' | 'temporal-properties' | 'assembly'

export interface FeatureLoadFailure {
  readonly featureId: string
  readonly stage: FeatureLoadFailureStage
  readonly message: string
  readonly retained: boolean
}

export interface PaginationMetadata {
  readonly numberMatched?: number
  readonly numberReturned?: number
  readonly next?: ApiLink
  readonly truncated: boolean
}

export interface CollectionLoadResult {
  readonly features: readonly unknown[]
  readonly failures: readonly FeatureLoadFailure[]
  readonly pagination: PaginationMetadata
  readonly temporalPagination?: readonly FeatureTemporalPaginationSeed[]
}
