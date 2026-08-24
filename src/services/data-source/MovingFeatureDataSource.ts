export interface MovingFeatureDataSource {
  readonly origin?:
    | { readonly type: 'file' }
    | { readonly type: 'server'; readonly collectionId: string }
  load(): Promise<unknown>
}

export type DataSourceErrorKind = 'data-source' | 'invalid-json'

export class MovingFeatureDataSourceError extends Error {
  readonly kind: DataSourceErrorKind

  constructor(kind: DataSourceErrorKind, message: string) {
    super(message)
    this.name = 'MovingFeatureDataSourceError'
    this.kind = kind
  }
}
