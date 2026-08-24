import { useRef, useState, type DragEvent } from 'react'

import type { ValidationIssue } from '../../mfjson/validator'
import { FileDataSource } from '../../services/data-source/FileDataSource'
import {
  loadMovingFeatures,
  type MovingFeatureLoadError,
} from '../../services/loadMovingFeatures'
import { Icon } from '../ui/Icon'

type UploadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly filename: string }
  | {
      readonly status: 'success'
      readonly filename: string
      readonly count: number
    }
  | {
      readonly status: 'error'
      readonly filename?: string
      readonly error: MovingFeatureLoadError
    }

const formatDetail = (value: unknown): string => {
  if (value === undefined) return '—'
  try {
    if (typeof value === 'string') return value
    const serialized = JSON.stringify(value)
    return serialized ?? 'Unserializable value'
  } catch {
    return 'Unserializable value'
  }
}

function ValidationIssueList({
  issues,
}: {
  readonly issues: readonly ValidationIssue[]
}) {
  return (
    <ul className="upload-issues">
      {issues.map((issue, index) => (
        <li key={`${issue.path}-${issue.code}-${index}`}>
          <div>
            <strong>{issue.featureId ?? 'Dataset'}</strong>
            <code>{issue.path}</code>
          </div>
          <p>{issue.message}</p>
          {issue.expected !== undefined || issue.actual !== undefined ? (
            <small>
              Expected: {formatDetail(issue.expected)} · Actual:{' '}
              {formatDetail(issue.actual)}
            </small>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export interface LocalFileLoaderProps {
  readonly onClose: () => void
  readonly onLoaded: (filename: string) => void
  readonly open: boolean
}

export function LocalFileLoader({
  onClose,
  onLoaded,
  open,
}: LocalFileLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [state, setState] = useState<UploadState>({ status: 'idle' })

  if (!open) return null

  const processFile = async (file: File) => {
    setState({ status: 'loading', filename: file.name })
    const result = await loadMovingFeatures(new FileDataSource(file))
    if (result.success) {
      setState({
        status: 'success',
        filename: file.name,
        count: result.features.length,
      })
      onLoaded(file.name)
    } else {
      setState({ status: 'error', filename: file.name, error: result.error })
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) void processFile(file)
  }

  const issues =
    state.status === 'error' && 'issues' in state.error
      ? state.error.issues
      : undefined

  return (
    <div className="upload-backdrop" role="presentation">
      <section
        aria-labelledby="local-file-title"
        aria-modal="true"
        className="upload-dialog"
        role="dialog"
      >
        <header className="upload-dialog-header">
          <div>
            <span>Open Data</span>
            <h2 id="local-file-title">Local MF-JSON file</h2>
          </div>
          <button
            aria-label="Close local file dialog"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>

        <div
          className={`file-drop-zone ${dragOver ? 'is-drag-over' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <Icon name="upload" size={24} />
          <strong>
            {dragOver ? 'Drop file to open' : 'Drop an MF-JSON file here'}
          </strong>
          <span>or choose a local file</span>
          <button
            disabled={state.status === 'loading'}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            Browse files
          </button>
          <input
            accept=".json,.mfjson,application/json"
            aria-label="Choose local MF-JSON file"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void processFile(file)
              event.currentTarget.value = ''
            }}
            ref={inputRef}
            type="file"
          />
          <small>Accepted formats: .json, .mfjson</small>
        </div>

        <div aria-live="polite" className="upload-status">
          {state.status === 'loading' ? (
            <>
              <span className="loading-spinner" />
              <div>
                <strong>Loading {state.filename}</strong>
                <p>Reading, validating, and normalizing moving features…</p>
              </div>
            </>
          ) : null}
          {state.status === 'success' ? (
            <>
              <span className="upload-success">
                <Icon name="activity" />
              </span>
              <div>
                <strong>{state.filename} loaded</strong>
                <p>
                  {state.count} moving{' '}
                  {state.count === 1 ? 'feature' : 'features'} replaced the
                  current dataset.
                </p>
              </div>
            </>
          ) : null}
          {state.status === 'error' ? (
            <>
              <Icon name="alert" />
              <div>
                <strong>Could not load {state.filename}</strong>
                <p>{state.error.message}</p>
              </div>
            </>
          ) : null}
        </div>
        {issues ? <ValidationIssueList issues={issues} /> : null}
      </section>
    </div>
  )
}
