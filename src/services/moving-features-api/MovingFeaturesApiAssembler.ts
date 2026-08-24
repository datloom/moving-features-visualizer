import { validateMfJson } from '../../mfjson/validator'
import { MovingFeaturesApiError } from './errors'
import type { MovingFeaturesApiClient } from './MovingFeaturesApiClient'
import {
  CHILD_RESOURCE_LIMIT,
  DEFAULT_FEATURE_CONCURRENCY,
  type CollectionLoadResult,
  type DateTimeInterval,
  type FeatureLoadFailure,
  type FeatureMetadata,
  type FeatureQueryOptions,
  type FeatureTemporalPaginationSeed,
  type TemporalResourcePaginationSeed,
} from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const geometryKey = (value: unknown): string =>
  isRecord(value) && typeof value.id === 'string'
    ? `id:${value.id}`
    : `content:${JSON.stringify(value)}`

const propertyGroupKey = (value: unknown): string =>
  `content:${JSON.stringify(value)}`

const validateMetadata = (value: FeatureMetadata): string | undefined => {
  if (
    !isRecord(value) ||
    value.type !== 'Feature' ||
    typeof value.id !== 'string'
  ) {
    return 'Feature metadata must contain a string id and type Feature.'
  }
  if (
    !Array.isArray(value.time) ||
    value.time.length !== 2 ||
    value.time.some(
      (time) => typeof time !== 'string' || !Number.isFinite(Date.parse(time)),
    )
  ) {
    return 'Feature metadata must contain a valid two-value time range.'
  }
  return undefined
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown feature loading error.'

const effectiveDatetime = (
  featureTime: FeatureMetadata['time'],
  query: DateTimeInterval | undefined,
): DateTimeInterval => {
  const featureStart = featureTime[0].trim()
  const featureEnd = featureTime[1].trim()
  if (!query) return { start: featureStart, end: featureEnd }
  const queryStart = query.start.trim()
  const queryEnd = query.end.trim()
  return {
    start:
      Date.parse(queryStart) > Date.parse(featureStart)
        ? queryStart
        : featureStart,
    end: Date.parse(queryEnd) < Date.parse(featureEnd) ? queryEnd : featureEnd,
  }
}

const resourcePagination = (
  offset: number,
  limit: number,
  numberMatched: number | undefined,
  numberReturned: number,
  links: readonly { readonly href: string; readonly rel: string }[] | undefined,
  error?: string,
): TemporalResourcePaginationSeed => {
  const next = links?.find((link) => link.rel === 'next')
  const nextOffset = offset + numberReturned
  return {
    offset: nextOffset,
    limit,
    numberMatched,
    numberReturned,
    next,
    hasMore:
      error !== undefined ||
      next !== undefined ||
      (numberMatched !== undefined && nextOffset < numberMatched),
    error,
  }
}

export class MovingFeaturesApiAssembler {
  constructor(
    private readonly client: MovingFeaturesApiClient,
    private readonly concurrency = DEFAULT_FEATURE_CONCURRENCY,
    private readonly childResourceLimit = CHILD_RESOURCE_LIMIT,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError('Feature concurrency must be a positive integer.')
    }
  }

  async loadCollection(
    collectionId: string,
    options: FeatureQueryOptions,
  ): Promise<CollectionLoadResult> {
    const items = await this.client.getFeatures(collectionId, options)
    const featureSlots: unknown[] = new Array(items.features.length)
    const paginationSlots = Array.from<
      FeatureTemporalPaginationSeed | undefined
    >({ length: items.features.length })
    const failures: FeatureLoadFailure[] = []
    let cursor = 0

    const loadNext = async (): Promise<void> => {
      while (cursor < items.features.length) {
        const index = cursor++
        const metadata = items.features[index]!
        const result = await this.loadFeature(
          collectionId,
          metadata,
          options.datetime,
        )
        if (result.feature !== undefined) featureSlots[index] = result.feature
        if (result.pagination !== undefined)
          paginationSlots[index] = result.pagination
        failures.push(...result.failures)
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(this.concurrency, items.features.length) },
        () => loadNext(),
      ),
    )

    const next = items.links?.find((link) => link.rel === 'next')
    const numberReturned = items.numberReturned ?? items.features.length
    return {
      features: featureSlots.filter((feature) => feature !== undefined),
      failures,
      pagination: {
        numberMatched: items.numberMatched,
        numberReturned,
        next,
        truncated:
          next !== undefined ||
          (items.numberMatched !== undefined &&
            items.numberMatched > numberReturned),
      },
      temporalPagination: paginationSlots.filter(
        (state): state is FeatureTemporalPaginationSeed => state !== undefined,
      ),
    }
  }

  private async loadFeature(
    collectionId: string,
    metadata: FeatureMetadata,
    collectionDatetime?: DateTimeInterval,
  ): Promise<{
    readonly feature?: unknown
    readonly failures: readonly FeatureLoadFailure[]
    readonly pagination?: FeatureTemporalPaginationSeed
  }> {
    const metadataError = validateMetadata(metadata)
    if (metadataError) {
      return {
        failures: [
          {
            featureId:
              typeof metadata.id === 'string' ? metadata.id : '(unknown)',
            stage: 'metadata',
            message: metadataError,
            retained: false,
          },
        ],
      }
    }

    const datetime = effectiveDatetime(metadata.time, collectionDatetime)
    let temporalGeometry: Awaited<
      ReturnType<MovingFeaturesApiClient['getTemporalGeometry']>
    >
    try {
      temporalGeometry = await this.client.getTemporalGeometry(
        collectionId,
        metadata.id,
        {
          datetime,
          limit: this.childResourceLimit,
        },
      )
    } catch (error) {
      return {
        failures: [
          {
            featureId: metadata.id,
            stage: 'temporal-geometry',
            message: errorMessage(error),
            retained: false,
          },
        ],
      }
    }

    if (
      !isRecord(temporalGeometry) ||
      temporalGeometry.type !== 'TemporalGeometrySequence' ||
      !Array.isArray(temporalGeometry.geometrySequence) ||
      temporalGeometry.geometrySequence.length === 0
    ) {
      return {
        failures: [
          {
            featureId: metadata.id,
            stage: 'temporal-geometry',
            message:
              'TemporalGeometrySequence must contain at least one segment.',
            retained: false,
          },
        ],
      }
    }

    const failures: FeatureLoadFailure[] = []
    let temporalProperties: readonly unknown[] = []
    let propertiesResponse:
      | Awaited<ReturnType<MovingFeaturesApiClient['getTemporalProperties']>>
      | undefined
    let propertiesError: string | undefined
    try {
      const response = await this.client.getTemporalProperties(
        collectionId,
        metadata.id,
        {
          datetime,
          limit: this.childResourceLimit,
        },
      )
      if (!isRecord(response) || !Array.isArray(response.temporalProperties)) {
        throw new MovingFeaturesApiError(
          'invalid-response',
          'Temporal properties response is missing temporalProperties.',
        )
      }
      propertiesResponse = response
      temporalProperties = response.temporalProperties
    } catch (error) {
      propertiesError = errorMessage(error)
      failures.push({
        featureId: metadata.id,
        stage: 'temporal-properties',
        message: propertiesError,
        retained: true,
      })
    }

    const staticMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([name]) => name !== 'geometry'),
    )
    const assembled = {
      ...staticMetadata,
      temporalGeometry: temporalGeometry.geometrySequence,
      temporalProperties,
    }
    const validation = validateMfJson(assembled)
    if (!validation.valid) {
      return {
        failures: [
          ...failures.map((failure) => ({ ...failure, retained: false })),
          {
            featureId: metadata.id,
            stage: 'assembly',
            message: validation.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join(' '),
            retained: false,
          },
        ],
      }
    }

    const geometryReturned =
      temporalGeometry.numberReturned ??
      temporalGeometry.geometrySequence.length
    const propertiesReturned =
      propertiesResponse?.numberReturned ?? temporalProperties.length
    return {
      feature: assembled,
      failures,
      pagination: {
        featureId: metadata.id,
        metadata,
        datetime,
        queryRangeMode: collectionDatetime ? 'fixed' : 'source-derived',
        normalizationGeometry: temporalGeometry.geometrySequence[0],
        geometryKeys: temporalGeometry.geometrySequence.map(geometryKey),
        propertyGroupKeys: temporalProperties.map(propertyGroupKey),
        geometry: resourcePagination(
          0,
          this.childResourceLimit,
          temporalGeometry.numberMatched,
          geometryReturned,
          temporalGeometry.links,
        ),
        properties: resourcePagination(
          0,
          this.childResourceLimit,
          propertiesResponse?.numberMatched,
          propertiesReturned,
          propertiesResponse?.links,
          propertiesError,
        ),
      },
    }
  }
}
