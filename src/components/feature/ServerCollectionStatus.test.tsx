import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useServerCollectionStore } from '../../store/serverCollectionStore'
import { ServerCollectionStatus } from './ServerCollectionStatus'

const session = {
  baseUrl: 'http://localhost:5050',
  collectionId: 'routes',
  collectionTitle: 'GeoJsonTest',
  limit: 10,
  serverPosition: 10,
  numberMatched: 50,
  numberLoaded: 9,
  failureCount: 1,
  hasMore: true,
}

describe('ServerCollectionStatus', () => {
  beforeEach(() => {
    useServerCollectionStore.setState({
      session,
      loadingMore: false,
      error: undefined,
    })
  })
  afterEach(cleanup)

  it('shows loaded and processed counts and loads more outside the data dialog', () => {
    const loadMore = vi.fn().mockResolvedValue(undefined)
    useServerCollectionStore.setState({ loadMore })
    render(<ServerCollectionStatus />)

    expect(screen.getByText('9 of 50 Features loaded')).toBeInTheDocument()
    expect(screen.getByText(/10 server records processed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load 10 More' }))
    expect(loadMore).toHaveBeenCalledOnce()
  })

  it('disables duplicate clicks while loading and exposes retry errors', () => {
    useServerCollectionStore.setState({ loadingMore: true, error: 'Offline.' })
    render(<ServerCollectionStatus />)

    expect(
      screen.getByRole('button', { name: 'Loading 10 more…' }),
    ).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Offline. You can retry.',
    )
  })

  it('hides Load More at the end', () => {
    useServerCollectionStore.setState({
      session: {
        ...session,
        serverPosition: 50,
        numberLoaded: 49,
        hasMore: false,
      },
    })
    render(<ServerCollectionStatus />)

    expect(
      screen.queryByRole('button', { name: /Load/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('All available Features loaded'),
    ).toBeInTheDocument()
  })
})
