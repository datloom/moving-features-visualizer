import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import {
  initialImageViewerState,
  useImageViewerStore,
} from './store/imageViewerStore'

vi.mock('./components/map/MapWorkspace', () => ({
  MapWorkspace: ({
    feature,
    showFeatureExplorer,
    onToggleFeatureExplorer,
    showTemporalProperties,
    onToggleTemporalProperties,
  }: {
    feature: { id: string }
    showFeatureExplorer: boolean
    onToggleFeatureExplorer: () => void
    showTemporalProperties: boolean
    onToggleTemporalProperties: () => void
  }) => (
    <div aria-label="Moving features map">
      {feature.id}
      <button onClick={onToggleFeatureExplorer} type="button">
        {showFeatureExplorer ? 'Hide Feature Explorer' : 'Show Feature Explorer'}
      </button>
      <button onClick={onToggleTemporalProperties} type="button">
        {showTemporalProperties
          ? 'Hide Temporal Properties'
          : 'Show Temporal Properties'}
      </button>
    </div>
  ),
}))

vi.mock('./components/chart/TemporalPropertiesPanel', () => ({
  TemporalPropertiesPanel: ({ collapsed }: { collapsed?: boolean }) => (
    <div aria-hidden={collapsed} aria-label="Temporal Properties" />
  ),
}))

describe('App', () => {
  afterEach(cleanup)

  it('identifies the application', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Moving Features' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Feature Explorer')).toBeInTheDocument()
    expect(screen.getByLabelText('Moving features map')).toHaveTextContent(
      'tokyo-survey-01',
    )
  })

  it('selects features and exposes intentional workspace states', () => {
    render(<App />)

    fireEvent.click(screen.getByLabelText('Select Yokohama inspection'))
    expect(screen.getByLabelText('Moving features map')).toHaveTextContent(
      'yokohama-inspection-02',
    )

    fireEvent.change(screen.getByLabelText('Workspace dataset state'), {
      target: { value: 'error' },
    })
    expect(screen.getByText('Dataset could not be loaded')).toBeInTheDocument()
    expect(
      screen.getByText('MF-JSON validation found 4 issues.'),
    ).toBeInTheDocument()
  })
})

describe('App workspace panel visibility', () => {
  afterEach(cleanup)

  it('shows Feature Explorer, Temporal Properties, and Timeline and playback by default', () => {
    render(<App />)

    expect(screen.getByLabelText('Feature Explorer')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
    expect(screen.getByLabelText('Temporal Properties')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
    expect(screen.getByLabelText('Timeline and playback')).toBeInTheDocument()
  })

  it('hides Feature Explorer without hiding Temporal Properties or Timeline and playback, and restores it', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Hide Feature Explorer' }))
    expect(screen.getByLabelText('Feature Explorer')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.getByLabelText('Temporal Properties')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
    expect(screen.getByLabelText('Timeline and playback')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show Feature Explorer' }))
    expect(screen.getByLabelText('Feature Explorer')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
  })

  it('hides Temporal Properties without hiding Feature Explorer or Timeline and playback, and restores it', () => {
    render(<App />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Hide Temporal Properties' }),
    )
    expect(screen.getByLabelText('Temporal Properties')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.getByLabelText('Feature Explorer')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
    expect(screen.getByLabelText('Timeline and playback')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Show Temporal Properties' }),
    )
    expect(screen.getByLabelText('Temporal Properties')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
  })

  it('hides both panels simultaneously and restores them independently', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Hide Feature Explorer' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Hide Temporal Properties' }),
    )
    expect(screen.getByLabelText('Feature Explorer')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.getByLabelText('Temporal Properties')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.getByLabelText('Timeline and playback')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show Feature Explorer' }))
    expect(screen.getByLabelText('Feature Explorer')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
    expect(screen.getByLabelText('Temporal Properties')).toHaveAttribute(
      'aria-hidden',
      'true',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Show Temporal Properties' }),
    )
    expect(screen.getByLabelText('Temporal Properties')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
  })

  it('preserves the selected feature across a Feature Explorer visibility toggle', () => {
    render(<App />)

    fireEvent.click(screen.getByLabelText('Select Yokohama inspection'))
    expect(screen.getByLabelText('Moving features map')).toHaveTextContent(
      'yokohama-inspection-02',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hide Feature Explorer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show Feature Explorer' }))

    expect(screen.getByLabelText('Moving features map')).toHaveTextContent(
      'yokohama-inspection-02',
    )
  })
})

describe('App floating Image viewer placement', () => {
  afterEach(() => {
    cleanup()
    useImageViewerStore.setState(initialImageViewerState)
  })

  it('renders the floating image viewer outside the collapsible Temporal Properties subtree', () => {
    useImageViewerStore.getState().open('camera', [])
    render(<App />)

    const viewer = screen.getByRole('dialog', { name: 'camera image viewer' })
    const temporalProperties = screen.getByLabelText('Temporal Properties')
    expect(temporalProperties.contains(viewer)).toBe(false)

    // Collapsing Temporal Properties must not affect the floating viewer.
    fireEvent.click(
      screen.getByRole('button', { name: 'Hide Temporal Properties' }),
    )
    expect(
      screen.getByRole('dialog', { name: 'camera image viewer' }),
    ).toBeInTheDocument()
  })
})
