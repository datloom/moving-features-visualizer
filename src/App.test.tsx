import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { App } from './App'

vi.mock('./components/map/CesiumMap', () => ({
  CesiumMap: () => <div aria-label="Moving features map" role="application" />,
}))

vi.mock('./components/chart/MeasurePropertyChart', () => ({
  MeasurePropertyChart: () => <div aria-label="Measure property chart" />,
}))

describe('App', () => {
  it('identifies the application', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'MF-JSON Visualizer' }),
    ).toBeInTheDocument()
  })
})
