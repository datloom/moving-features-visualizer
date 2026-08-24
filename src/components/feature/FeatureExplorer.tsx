import { useState } from 'react'

import type { MovingFeature } from '../../mfjson/types'
import { Icon } from '../ui/Icon'

const featureLabel = (feature: MovingFeature): string =>
  typeof feature.properties.label === 'string'
    ? feature.properties.label
    : feature.id

export interface FeatureExplorerProps {
  readonly features: readonly MovingFeature[]
  readonly onClose: () => void
  readonly onSelect: (featureId: string) => void
  readonly open: boolean
  readonly selectedFeatureId?: string
}

export function FeatureExplorer({
  features,
  onClose,
  onSelect,
  open,
  selectedFeatureId,
}: FeatureExplorerProps) {
  const [query, setQuery] = useState('')
  const filteredFeatures = features.filter((feature) =>
    `${feature.id} ${featureLabel(feature)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )

  return (
    <aside
      aria-label="Feature Explorer"
      className={`feature-explorer ${open ? 'is-open' : ''}`}
    >
      <header className="panel-heading">
        <div>
          <h2>Feature Explorer</h2>
          <span>{features.length} moving features</span>
        </div>
        <button
          aria-label="Close feature explorer"
          className="icon-button explorer-close"
          onClick={onClose}
          type="button"
        >
          <Icon name="x" />
        </button>
      </header>
      <label className="feature-search">
        <Icon name="search" />
        <span className="visually-hidden">Search features</span>
        <input
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search features"
          type="search"
          value={query}
        />
      </label>
      <div className="feature-list" role="list">
        {filteredFeatures.map((feature) => {
          const selected = feature.id === selectedFeatureId
          return (
            <button
              aria-label={`Select ${featureLabel(feature)}`}
              aria-current={selected ? 'true' : undefined}
              className={`feature-row ${selected ? 'is-selected' : ''}`}
              key={feature.id}
              onClick={() => onSelect(feature.id)}
              role="listitem"
              type="button"
            >
              <span className="feature-symbol">
                <Icon name="crosshair" size={15} />
              </span>
              <span className="feature-row-copy">
                <strong>{featureLabel(feature)}</strong>
                <small>{feature.id}</small>
              </span>
              <span className="feature-samples">
                {feature.temporalGeometry.segments.reduce(
                  (count, segment) => count + segment.samples.length,
                  0,
                )}
                <small>samples</small>
              </span>
            </button>
          )
        })}
      </div>
      {filteredFeatures.length === 0 ? (
        <p className="compact-empty">No matching features.</p>
      ) : null}
    </aside>
  )
}
