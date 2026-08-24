import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { loadMovingFeatures } = vi.hoisted(() => ({
  loadMovingFeatures: vi.fn(),
}))

vi.mock('../../services/loadMovingFeatures', () => ({ loadMovingFeatures }))

import { LocalFileLoader } from './LocalFileLoader'

describe('LocalFileLoader', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads a selected file and communicates success', async () => {
    const onLoaded = vi.fn()
    loadMovingFeatures.mockResolvedValue({
      success: true,
      features: [{ id: 'vehicle-1' }],
      timeRange: { startTime: 1, endTime: 2 },
    })
    render(<LocalFileLoader onClose={vi.fn()} onLoaded={onLoaded} open />)

    const selectedFile = new File(['{}'], 'route.mfjson', {
      type: 'application/json',
    })
    fireEvent.change(screen.getByLabelText('Choose local MF-JSON file'), {
      target: { files: [selectedFile] },
    })

    expect(await screen.findByText('route.mfjson loaded')).toBeInTheDocument()
    expect(screen.getByText(/1 moving feature replaced/)).toBeInTheDocument()
    expect(onLoaded).toHaveBeenCalledWith('route.mfjson')
  })

  it('supports drag and drop and shows loading state', async () => {
    let resolveLoad: ((value: unknown) => void) | undefined
    loadMovingFeatures.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve
      }),
    )
    render(<LocalFileLoader onClose={vi.fn()} onLoaded={vi.fn()} open />)
    const dropZone = screen.getByText(
      'Drop an MF-JSON file here',
    ).parentElement!

    fireEvent.dragEnter(dropZone)
    expect(screen.getByText('Drop file to open')).toBeInTheDocument()
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [new File(['{}'], 'route.json')] },
    })
    expect(screen.getByText('Loading route.json')).toBeInTheDocument()

    resolveLoad?.({
      success: true,
      features: [{ id: 'one' }, { id: 'two' }],
      timeRange: { startTime: 1, endTime: 2 },
    })
    await waitFor(() =>
      expect(screen.getByText('route.json loaded')).toBeInTheDocument(),
    )
  })

  it('renders structured MF-JSON validation issues', async () => {
    loadMovingFeatures.mockResolvedValue({
      success: false,
      error: {
        type: 'validation',
        message: 'MF-JSON validation failed.',
        issues: [
          {
            featureId: 'vehicle-7',
            path: '$.temporalGeometry.datetimes[1]',
            code: 'invalid_datetime',
            message: 'Datetime must be valid.',
            expected: 'ISO 8601',
            actual: 'yesterday',
          },
        ],
      },
    })
    render(<LocalFileLoader onClose={vi.fn()} onLoaded={vi.fn()} open />)

    fireEvent.change(screen.getByLabelText('Choose local MF-JSON file'), {
      target: { files: [new File(['{}'], 'invalid.json')] },
    })

    expect(await screen.findByText('vehicle-7')).toBeInTheDocument()
    expect(
      screen.getByText('$.temporalGeometry.datetimes[1]'),
    ).toBeInTheDocument()
    expect(screen.getByText('Datetime must be valid.')).toBeInTheDocument()
    expect(
      screen.getByText(/Expected: ISO 8601.*Actual: yesterday/),
    ).toBeInTheDocument()
  })

  it('reports file read and parse errors without crashing', async () => {
    loadMovingFeatures.mockResolvedValue({
      success: false,
      error: {
        type: 'invalid-json',
        message: 'broken.json contains malformed JSON.',
      },
    })
    render(<LocalFileLoader onClose={vi.fn()} onLoaded={vi.fn()} open />)

    fireEvent.change(screen.getByLabelText('Choose local MF-JSON file'), {
      target: { files: [new File(['{'], 'broken.json')] },
    })

    expect(
      await screen.findByText('Could not load broken.json'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('broken.json contains malformed JSON.'),
    ).toBeInTheDocument()
  })
})
