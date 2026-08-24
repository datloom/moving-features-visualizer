import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CollectionLoadResult } from '../../services/moving-features-api/types'
import { useFeatureTemporalPaginationStore } from '../../store/featureTemporalPaginationStore'
import { FeatureTemporalDataStatus } from './FeatureTemporalDataStatus'

const paginationResult: CollectionLoadResult = {
  features: [],
  failures: [],
  pagination: { truncated: false },
  temporalPagination: [
    {
      featureId: 'server-feature',
      metadata: {
        id: 'server-feature',
        type: 'Feature',
        time: ['2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'],
      },
      datetime: {
        start: '2026-01-01T10:00:00Z',
        end: '2026-01-01T11:00:00Z',
      },
      normalizationGeometry: {},
      geometryKeys: [],
      propertyGroupKeys: [],
      geometry: {
        offset: 10,
        limit: 10,
        numberMatched: 35,
        numberReturned: 10,
        hasMore: true,
      },
      properties: {
        offset: 4,
        limit: 4,
        numberMatched: 12,
        numberReturned: 4,
        hasMore: true,
      },
    },
  ],
}

describe('FeatureTemporalDataStatus', () => {
  beforeEach(() => useFeatureTemporalPaginationStore.setState({ features: {} }))
  afterEach(cleanup)

  it('does not expose server pagination for a local Feature', () => {
    render(<FeatureTemporalDataStatus featureId="local-feature" />)
    expect(
      screen.queryByRole('button', { name: 'Load More Temporal Data' }),
    ).not.toBeInTheDocument()
  })

  it('shows independent server progress and one unified action', () => {
    const loadMore = vi.fn().mockResolvedValue(undefined)
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        paginationResult,
        'replace',
      )
    useFeatureTemporalPaginationStore.setState({ loadMore })
    render(<FeatureTemporalDataStatus featureId="server-feature" />)

    expect(screen.getByText('10 / 35 loaded')).toBeInTheDocument()
    expect(screen.getByText('4 / 12 loaded')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Load More Temporal Data' }),
    )
    expect(loadMore).toHaveBeenCalledWith('server-feature')
  })

  it('prevents duplicate clicks and reports resource-specific errors', () => {
    useFeatureTemporalPaginationStore
      .getState()
      .installFromCollection(
        'http://localhost:5050',
        'routes',
        paginationResult,
        'replace',
      )
    const current =
      useFeatureTemporalPaginationStore.getState().features['server-feature']!
    useFeatureTemporalPaginationStore.setState({
      features: {
        'server-feature': {
          ...current,
          geometry: { ...current.geometry, loading: true },
          properties: { ...current.properties, error: 'Properties offline.' },
        },
      },
    })
    render(<FeatureTemporalDataStatus featureId="server-feature" />)

    expect(
      screen.getByRole('button', { name: 'Loading more temporal data…' }),
    ).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Properties: Properties offline.',
    )
  })
})
