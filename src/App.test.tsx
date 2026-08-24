import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'

vi.mock('./components/map/MapWorkspace', () => ({
  MapWorkspace: ({ feature }: { feature: { id: string } }) => (
    <div aria-label="Moving features map">{feature.id}</div>
  ),
}))

vi.mock('./components/chart/TemporalPropertiesPanel', () => ({
  TemporalPropertiesPanel: () => <div aria-label="Temporal Properties" />,
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
