import { MovingFeaturesApiError } from './errors'
import type {
  ChildResourceQueryOptions,
  CollectionsResponse,
  DateTimeInterval,
  FeatureQueryOptions,
  FeaturesResponse,
  TemporalGeometrySequenceResponse,
  TemporalPropertiesResponse,
} from './types'
import { MAX_FEATURE_LIMIT, MIN_FEATURE_LIMIT } from './types'

type FetchImplementation = typeof fetch

export const validateLimit = (limit: number): void => {
  if (
    !Number.isInteger(limit) ||
    limit < MIN_FEATURE_LIMIT ||
    limit > MAX_FEATURE_LIMIT
  ) {
    throw new RangeError(
      `Feature limit must be an integer from ${MIN_FEATURE_LIMIT} to ${MAX_FEATURE_LIMIT}.`,
    )
  }
}

export const serializeDateTimeInterval = ({
  start,
  end,
}: DateTimeInterval): string => {
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end))
  ) {
    throw new RangeError(
      'Datetime interval values must be valid ISO 8601 dates.',
    )
  }
  if (Date.parse(start) > Date.parse(end)) {
    throw new RangeError('Datetime interval start must not be after its end.')
  }
  return `"${start}/${end}"`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export class MovingFeaturesApiClient {
  readonly baseUrl: string

  constructor(
    baseUrl: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {
    const parsed = new URL(baseUrl)
    parsed.pathname = parsed.pathname.replace(/\/$/, '')
    this.baseUrl = parsed.toString().replace(/\/$/, '')
  }

  private createUrl(path: string, options?: ChildResourceQueryOptions): URL {
    const url = new URL(`${this.baseUrl}${path}`)
    if (options?.limit !== undefined) {
      validateLimit(options.limit)
      url.searchParams.set('limit', String(options.limit))
    }
    if (options?.datetime) {
      url.searchParams.set(
        'datetime',
        serializeDateTimeInterval(options.datetime),
      )
    }
    return url
  }

  private async request<T>(url: URL): Promise<T> {
    let response: Response
    try {
      response = await this.fetchImplementation(url, {
        headers: { Accept: 'application/json' },
      })
    } catch (error) {
      throw new MovingFeaturesApiError(
        'network',
        `Could not reach the Moving Features server. Check the server URL and CORS configuration. ${error instanceof Error ? error.message : ''}`.trim(),
      )
    }
    if (!response.ok) {
      throw new MovingFeaturesApiError(
        'http',
        `Moving Features API request failed with HTTP ${response.status}.`,
        response.status,
      )
    }
    try {
      return (await response.json()) as T
    } catch {
      throw new MovingFeaturesApiError(
        'invalid-json',
        'Moving Features API returned malformed JSON.',
      )
    }
  }

  async getCollections(): Promise<CollectionsResponse> {
    const response = await this.request<unknown>(this.createUrl('/collections'))
    if (!isRecord(response) || !Array.isArray(response.collections)) {
      throw new MovingFeaturesApiError(
        'invalid-response',
        'Collections response is missing a collections array.',
      )
    }
    return {
      collections: response.collections.filter(
        (
          collection,
        ): collection is CollectionsResponse['collections'][number] =>
          isRecord(collection) &&
          typeof collection.id === 'string' &&
          collection.itemType === 'movingfeature',
      ),
      links: Array.isArray(response.links)
        ? (response.links as CollectionsResponse['links'])
        : undefined,
    }
  }

  getCollection(collectionId: string): Promise<unknown> {
    return this.request(
      this.createUrl(`/collections/${encodeURIComponent(collectionId)}`),
    )
  }

  async getFeatures(
    collectionId: string,
    options: FeatureQueryOptions,
  ): Promise<FeaturesResponse> {
    validateLimit(options.limit)
    const response = await this.request<unknown>(
      this.createUrl(
        `/collections/${encodeURIComponent(collectionId)}/items`,
        options,
      ),
    )
    if (
      !isRecord(response) ||
      response.type !== 'FeatureCollection' ||
      !Array.isArray(response.features)
    ) {
      throw new MovingFeaturesApiError(
        'invalid-response',
        'Items response is not a FeatureCollection.',
      )
    }
    return response as unknown as FeaturesResponse
  }

  getFeature(collectionId: string, featureId: string): Promise<unknown> {
    return this.request(
      this.createUrl(
        `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(featureId)}`,
      ),
    )
  }

  getTemporalGeometry(
    collectionId: string,
    featureId: string,
    options: ChildResourceQueryOptions = {},
  ): Promise<TemporalGeometrySequenceResponse> {
    return this.request(
      this.createUrl(
        `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(featureId)}/tgsequence`,
        options,
      ),
    )
  }

  getTemporalProperties(
    collectionId: string,
    featureId: string,
    options: ChildResourceQueryOptions = {},
  ): Promise<TemporalPropertiesResponse> {
    return this.request(
      this.createUrl(
        `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(featureId)}/tproperties`,
        options,
      ),
    )
  }
}
