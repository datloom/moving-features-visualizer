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

  const loading =
    state.refreshing || state.geometry.loading || state.properties.loading
  const hasMore = state.geometry.hasMore || state.properties.hasMore
  const errors = [
    state.geometry.error ? `Geometry: ${state.geometry.error}` : undefined,
    state.properties.error
      ? `Properties: ${state.properties.error}`
      : undefined,
    state.refreshError ? `Refresh: ${state.refreshError}` : undefined,
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
      {!hasMore ? (
        <span>
          {state.lastRefreshResult === 'no-new-data'
            ? 'No new data · Up to date'
            : state.lastRefreshResult === 'new-data'
              ? 'New temporal data loaded · Up to date'
              : 'Up to date'}
        </span>
      ) : null}
      <button
        disabled={loading}
        onClick={() => {
          const store = useFeatureTemporalPaginationStore.getState()
          void (hasMore ? store.loadMore(featureId) : store.refresh(featureId))
        }}
        type="button"
      >
        {loading
          ? hasMore
            ? 'Loading more temporal data…'
            : 'Checking for new data…'
          : hasMore
            ? 'Load More Temporal Data'
            : 'Check for New Data'}
      </button>
      {errors.length > 0 ? <p role="alert">{errors.join(' ')}</p> : null}
    </div>
  )
}
