import { Icon } from '../ui/Icon'

export function WorkspaceState({
  kind,
}: {
  readonly kind: 'empty' | 'loading' | 'error'
}) {
  if (kind === 'loading')
    return (
      <section aria-live="polite" className="workspace-state">
        <span className="loading-spinner" />
        <h2>Loading moving features</h2>
        <p>Validating geometry and temporal properties…</p>
      </section>
    )
  if (kind === 'error')
    return (
      <section
        aria-live="assertive"
        className="workspace-state workspace-state-error"
      >
        <Icon name="alert" size={24} />
        <h2>Dataset could not be loaded</h2>
        <p>MF-JSON validation found 4 issues.</p>
        <ul>
          <li>Unsupported geometry interpolation</li>
          <li>Invalid datetime at sample 2</li>
          <li>Coordinate count does not match timestamps</li>
        </ul>
      </section>
    )
  return (
    <section className="workspace-state">
      <Icon name="database" size={24} />
      <h2>No dataset loaded</h2>
      <p>Choose a sample dataset to begin spatial and temporal analysis.</p>
    </section>
  )
}
