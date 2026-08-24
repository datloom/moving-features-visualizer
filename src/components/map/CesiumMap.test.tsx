import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { destroy, setView, Viewer } = vi.hoisted(() => {
  const destroy = vi.fn()
  const isDestroyed = vi.fn(() => false)
  const setView = vi.fn()
  const Viewer = vi.fn(function () {
    return { camera: { setView }, destroy, isDestroyed }
  })

  return { destroy, setView, Viewer }
})

vi.mock('cesium', () => ({
  Cartesian3: { fromDegrees: vi.fn(() => 'initial-camera') },
  Viewer,
}))

import { CesiumMap } from './CesiumMap'

describe('CesiumMap', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates one Viewer on mount and destroys it on unmount', () => {
    const { container, rerender, unmount } = render(<CesiumMap />)

    expect(Viewer).toHaveBeenCalledTimes(1)
    expect(Viewer).toHaveBeenCalledWith(
      container.querySelector('.cesium-map'),
      expect.objectContaining({ animation: false, timeline: false }),
    )
    expect(setView).toHaveBeenCalledWith({ destination: 'initial-camera' })

    rerender(<CesiumMap />)
    expect(Viewer).toHaveBeenCalledTimes(1)

    unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('cleans up each Viewer created during React Strict Mode checks', () => {
    const { unmount } = render(
      <StrictMode>
        <CesiumMap />
      </StrictMode>,
    )

    expect(Viewer).toHaveBeenCalledTimes(2)
    expect(destroy).toHaveBeenCalledTimes(1)

    unmount()
    expect(destroy).toHaveBeenCalledTimes(2)
  })
})
