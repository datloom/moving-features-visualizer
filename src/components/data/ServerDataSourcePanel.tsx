import { useState } from 'react'

import { MovingFeaturesApiClient } from '../../services/moving-features-api/MovingFeaturesApiClient'
import { MovingFeaturesApiDataSource } from '../../services/moving-features-api/MovingFeaturesApiDataSource'
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_FEATURE_LIMIT,
  MAX_FEATURE_LIMIT,
  MIN_FEATURE_LIMIT,
  type MovingFeatureCollection,
} from '../../services/moving-features-api/types'
import { loadMovingFeatures } from '../../services/loadMovingFeatures'
import { useServerCollectionStore } from '../../store/serverCollectionStore'
import { Icon } from '../ui/Icon'

type ServerState =
  | { readonly status: 'idle' }
  | { readonly status: 'connecting' }
  | {
      readonly status: 'ready'
      readonly collections: readonly MovingFeatureCollection[]
    }
  | {
      readonly status: 'loading'
      readonly collections: readonly MovingFeatureCollection[]
    }
  | {
      readonly status: 'error'
      readonly message: string
      readonly collections?: readonly MovingFeatureCollection[]
    }
  | {
      readonly status: 'success'
      readonly count: number
      readonly failures: number
      readonly truncated: boolean
      readonly collections: readonly MovingFeatureCollection[]
    }

const formatExtentTime = (collection: MovingFeatureCollection): string => {
  const interval = collection.extent?.temporal?.interval
  if (!interval || interval.length < 2) return 'Temporal extent unavailable'
  return `${new Date(interval[0]!).toLocaleString()} → ${new Date(interval[1]!).toLocaleString()}`
}

export function ServerDataSourcePanel({
  onLoaded,
}: {
  readonly onLoaded: (datasetName: string) => void
}) {
  const [serverUrl, setServerUrl] = useState(DEFAULT_API_BASE_URL)
  const [selectedId, setSelectedId] = useState('')
  const [limit, setLimit] = useState(String(DEFAULT_FEATURE_LIMIT))
  const [state, setState] = useState<ServerState>({ status: 'idle' })
  const collections = 'collections' in state ? (state.collections ?? []) : []
  const parsedLimit = Number(limit)
  const validLimit =
    Number.isInteger(parsedLimit) &&
    parsedLimit >= MIN_FEATURE_LIMIT &&
    parsedLimit <= MAX_FEATURE_LIMIT

  const connect = async () => {
    setState({ status: 'connecting' })
    try {
      const response = await new MovingFeaturesApiClient(
        serverUrl,
      ).getCollections()
      setState({ status: 'ready', collections: response.collections })
      setSelectedId(response.collections[0]?.id ?? '')
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not connect to server.',
      })
    }
  }

  const loadCollection = async () => {
    if (!selectedId || !validLimit) return
    setState({ status: 'loading', collections })
    const client = new MovingFeaturesApiClient(serverUrl)
    const source = new MovingFeaturesApiDataSource(client, selectedId, {
      limit: parsedLimit,
      offset: 0,
    })
    const result = await loadMovingFeatures(source)
    if (!result.success) {
      setState({ status: 'error', message: result.error.message, collections })
      return
    }
    const summary = source.loadResult
    const selected = collections.find(
      (collection) => collection.id === selectedId,
    )
    if (summary) {
      useServerCollectionStore.getState().installSession(
        {
          baseUrl: serverUrl,
          collectionId: selectedId,
          collectionTitle: selected?.title ?? selectedId,
          limit: parsedLimit,
          numberMatched: summary.pagination.numberMatched,
        },
        summary,
      )
    }
    setState({
      status: 'success',
      count: result.features.length,
      failures: summary?.failures.length ?? 0,
      truncated: summary?.pagination.truncated ?? false,
      collections,
    })
    onLoaded(selected?.title ?? selectedId)
  }

  return (
    <div className="server-source-panel">
      <label className="server-field">
        <span>Server URL</span>
        <input
          disabled={state.status === 'connecting' || state.status === 'loading'}
          onChange={(event) => setServerUrl(event.target.value)}
          type="url"
          value={serverUrl}
        />
      </label>
      <button
        className="server-primary-button"
        disabled={!serverUrl || state.status === 'connecting'}
        onClick={() => void connect()}
        type="button"
      >
        {state.status === 'connecting' ? 'Connecting…' : 'Connect'}
      </button>

      {collections.length > 0 ? (
        <fieldset className="collection-list">
          <legend>Moving Feature Collections</legend>
          {collections.map((collection) => (
            <label
              className={selectedId === collection.id ? 'is-selected' : ''}
              key={collection.id}
            >
              <input
                checked={selectedId === collection.id}
                name="collection"
                onChange={() => setSelectedId(collection.id)}
                type="radio"
              />
              <span>
                <strong>{collection.title ?? collection.id}</strong>
                {collection.description ? (
                  <small>{collection.description}</small>
                ) : null}
                <small>{formatExtentTime(collection)}</small>
                {collection.extent?.spatial?.bbox ? (
                  <small>
                    Spatial extent: {collection.extent.spatial.bbox.join(', ')}
                  </small>
                ) : null}
                {collection.updateFrequency !== undefined ? (
                  <small>Updates every {collection.updateFrequency} ms</small>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : state.status === 'ready' ? (
        <p className="server-empty">
          No Moving Feature collections are available.
        </p>
      ) : null}

      {collections.length > 0 ? (
        <div className="server-load-controls">
          <label className="server-field">
            <span>Feature limit</span>
            <input
              aria-describedby="feature-limit-help"
              max={MAX_FEATURE_LIMIT}
              min={MIN_FEATURE_LIMIT}
              onChange={(event) => setLimit(event.target.value)}
              type="number"
              value={limit}
            />
          </label>
          <small id="feature-limit-help">
            Range: {MIN_FEATURE_LIMIT}–{MAX_FEATURE_LIMIT}
          </small>
          {!validLimit ? (
            <p className="server-error">Enter a whole number from 1 to 1000.</p>
          ) : null}
          <button
            className="server-primary-button"
            disabled={!selectedId || !validLimit || state.status === 'loading'}
            onClick={() => void loadCollection()}
            type="button"
          >
            {state.status === 'loading' ? 'Loading features…' : 'Load features'}
          </button>
        </div>
      ) : null}

      <div aria-live="polite" className="server-status">
        {state.status === 'error' ? (
          <>
            <Icon name="alert" />
            <p>{state.message}</p>
          </>
        ) : null}
        {state.status === 'success' ? (
          <>
            <Icon name="activity" />
            <p>
              {state.count} features loaded.{' '}
              {state.failures > 0
                ? `${state.failures} feature resource failures were reported. `
                : ''}
              {state.truncated
                ? 'More matching features are available on the server.'
                : ''}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
