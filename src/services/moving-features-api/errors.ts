export type MovingFeaturesApiErrorKind =
  'client' | 'network' | 'http' | 'invalid-json' | 'invalid-response'

export class MovingFeaturesApiError extends Error {
  constructor(
    readonly kind: MovingFeaturesApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'MovingFeaturesApiError'
  }
}
