import { validateMfJson } from '../../mfjson/validator'
import { MovingFeaturesApiError } from './errors'
import type { MovingFeaturesApiClient } from './MovingFeaturesApiClient'
import {
  CHILD_RESOURCE_LIMIT,
  DEFAULT_FEATURE_CONCURRENCY,
  type CollectionLoadResult,
  type FeatureLoadFailure,
  type FeatureMetadata,
  type FeatureQueryOptions,
} from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
    const failures: FeatureLoadFailure[] = []
    let cursor = 0

    const loadNext = async (): Promise<void> => {
      while (cursor < items.features.length) {
        const index = cursor++
        const metadata = items.features[index]!
        const result = await this.loadFeature(collectionId, metadata)
        if (result.feature !== undefined) featureSlots[index] = result.feature
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
    }
  }

  private async loadFeature(
    collectionId: string,
    metadata: FeatureMetadata,
  ): Promise<{
    readonly feature?: unknown
    readonly failures: readonly FeatureLoadFailure[]
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

    const datetime = { start: metadata.time[0], end: metadata.time[1] }
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
      temporalProperties = response.temporalProperties
    } catch (error) {
      failures.push({
        featureId: metadata.id,
        stage: 'temporal-properties',
        message: errorMessage(error),
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

    return { feature: assembled, failures }
  }
}
