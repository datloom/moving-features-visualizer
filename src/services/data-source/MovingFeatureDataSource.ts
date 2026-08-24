export interface MovingFeatureDataSource {
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
