import {
  MovingFeatureDataSourceError,
  type MovingFeatureDataSource,
} from '../data-source/MovingFeatureDataSource'
import { MovingFeaturesApiAssembler } from './MovingFeaturesApiAssembler'
import { MovingFeaturesApiClient } from './MovingFeaturesApiClient'
import type { CollectionLoadResult, FeatureQueryOptions } from './types'

export class MovingFeaturesApiDataSource implements MovingFeatureDataSource {
  private result?: CollectionLoadResult

  get origin() {
    return { type: 'server' as const, collectionId: this.collectionId }
  }

  constructor(
    client: MovingFeaturesApiClient,
    private readonly collectionId: string,
    private readonly options: FeatureQueryOptions,
    private readonly assembler = new MovingFeaturesApiAssembler(client),
  ) {}

  get loadResult(): CollectionLoadResult | undefined {
    return this.result
  }

  async load(): Promise<unknown> {
    try {
      this.result = await this.assembler.loadCollection(
        this.collectionId,
        this.options,
      )
      return this.result.features
    } catch (error) {
      throw new MovingFeatureDataSourceError(
        'data-source',
        error instanceof Error
          ? error.message
          : 'Moving Features server failed.',
      )
    }
  }
}
