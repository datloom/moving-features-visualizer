import { useServerCollectionStore } from '../../store/serverCollectionStore'

export function ServerCollectionStatus() {
  const session = useServerCollectionStore((state) => state.session)
  const loadingMore = useServerCollectionStore((state) => state.loadingMore)
  const error = useServerCollectionStore((state) => state.error)

  if (!session) return null

  const total = session.numberMatched
  const status =
    total === undefined
      ? `${session.numberLoaded} Features loaded`
      : `${session.numberLoaded} of ${total} Features loaded`

  return (
    <section
      aria-label="Server collection status"
      className="server-collection-status"
    >
      <div>
        <strong title={session.collectionTitle}>
          {session.collectionTitle}
        </strong>
        <span>{status}</span>
        {session.failureCount > 0 ? (
          <small>
            {session.serverPosition} server records processed ·{' '}
            {session.failureCount} resource failures
          </small>
        ) : null}
      </div>
      {session.hasMore ? (
        <button
          disabled={loadingMore}
          onClick={() => void useServerCollectionStore.getState().loadMore()}
          type="button"
        >
          {loadingMore
            ? `Loading ${session.limit} more…`
            : `Load ${session.limit} More`}
        </button>
      ) : (
        <span className="server-collection-complete">
          All available Features loaded
        </span>
      )}
      {error ? <p role="alert">{error} You can retry.</p> : null}
    </section>
  )
}
