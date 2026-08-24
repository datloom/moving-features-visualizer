import { useFeatureTemporalPaginationStore } from '../../store/featureTemporalPaginationStore'

const progress = (
  label: string,
  resource: {
    readonly offset: number
    readonly numberMatched?: number
    readonly hasMore: boolean
  },
) => {
  if (
    label === 'Properties' &&
    resource.offset === 0 &&
    resource.numberMatched === 0 &&
    !resource.hasMore
  ) {
    return 'None'
  }
  return resource.numberMatched === undefined
    ? `${resource.offset} loaded`
    : `${resource.offset} / ${resource.numberMatched} loaded`
}

export function FeatureTemporalDataStatus({
  featureId,
}: {
  readonly featureId: string
}) {
  const state = useFeatureTemporalPaginationStore(
    (store) => store.features[featureId],
  )
  if (!state) return null

  const loading = state.geometry.loading || state.properties.loading
  const hasMore = state.geometry.hasMore || state.properties.hasMore
  const errors = [
    state.geometry.error ? `Geometry: ${state.geometry.error}` : undefined,
    state.properties.error
      ? `Properties: ${state.properties.error}`
      : undefined,
  ].filter((message): message is string => message !== undefined)

  return (
    <div className="feature-temporal-status">
      <strong>Temporal data</strong>
      <dl>
        <div>
          <dt>Geometry</dt>
          <dd>{progress('Geometry', state.geometry)}</dd>
        </div>
        <div>
          <dt>Properties</dt>
          <dd>{progress('Properties', state.properties)}</dd>
        </div>
      </dl>
      {hasMore ? (
        <button
          disabled={loading}
          onClick={() =>
            void useFeatureTemporalPaginationStore
              .getState()
              .loadMore(featureId)
          }
          type="button"
        >
          {loading ? 'Loading more temporal data…' : 'Load More Temporal Data'}
        </button>
      ) : (
        <span>Temporal data complete</span>
      )}
      {errors.length > 0 ? <p role="alert">{errors.join(' ')}</p> : null}
    </div>
  )
}
