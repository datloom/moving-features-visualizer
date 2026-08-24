import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MovingFeature } from '../../mfjson/types'

vi.mock('./CesiumMap', () => ({
  CesiumMap: ({ mapMode }: { readonly mapMode: string }) => (
    <div data-testid="cesium-map-mode">{mapMode}</div>
  ),
}))

vi.mock('../feature/SelectedFeatureInfo', () => ({
  SelectedFeatureInfo: () => null,
}))

import { MapWorkspace } from './MapWorkspace'

const feature: MovingFeature = {
  id: 'height-test',
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [{ time: 1, longitude: 1, latitude: 2, height: 300 }],
      },
    ],
  },
  temporalProperties: [],
  properties: {},
}

describe('MapWorkspace map mode control', () => {
  afterEach(() => vi.clearAllMocks())

  it('defaults to 3D and switches between 2D and 3D', () => {
    render(<MapWorkspace feature={feature} />)

    expect(screen.getByTestId('cesium-map-mode')).toHaveTextContent('3d')
    expect(screen.getByRole('button', { name: '3D' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: '2D' }))
    expect(screen.getByTestId('cesium-map-mode')).toHaveTextContent('2d')
    expect(screen.getByText('2D map · WGS 84')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '3D' }))
    expect(screen.getByTestId('cesium-map-mode')).toHaveTextContent('3d')
  })
})
