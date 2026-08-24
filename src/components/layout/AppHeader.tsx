import { Icon } from '../ui/Icon'

export type WorkspaceMode = 'demo' | 'empty' | 'loading' | 'error'

export interface AppHeaderProps {
  readonly datasetName: string
  readonly explorerOpen: boolean
  readonly mode: WorkspaceMode
  readonly onModeChange: (mode: WorkspaceMode) => void
  readonly onOpenData: () => void
  readonly onToggleExplorer: () => void
}

export function AppHeader({
  datasetName,
  explorerOpen,
  mode,
  onModeChange,
  onOpenData,
  onToggleExplorer,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-group">
        <button
          aria-label={
            explorerOpen ? 'Close feature explorer' : 'Open feature explorer'
          }
          className="icon-button explorer-toggle"
          onClick={onToggleExplorer}
          type="button"
        >
          <Icon name={explorerOpen ? 'x' : 'menu'} />
        </button>
        <div aria-hidden="true" className="brand-mark">
          <Icon name="activity" size={18} />
        </div>
        <div className="brand-copy">
          <h1>Moving Features</h1>
          <span>Spatiotemporal workspace</span>
        </div>
      </div>

      <label className="dataset-control">
        <Icon name="database" />
        <span>Dataset</span>
        <select
          aria-label="Workspace dataset state"
          onChange={(event) =>
            onModeChange(event.currentTarget.value as WorkspaceMode)
          }
          value={mode}
        >
          <option value="demo">{datasetName}</option>
          <option value="loading">Loading state</option>
          <option value="empty">Empty workspace</option>
          <option value="error">Invalid MF-JSON</option>
        </select>
      </label>

      <div className="header-actions">
        <div className="header-status">
          <span className={`status-dot status-dot-${mode}`} />
          {mode === 'demo'
            ? 'Dataset ready'
            : mode === 'error'
              ? 'Validation failed'
              : mode}
        </div>
        <button className="open-data-button" onClick={onOpenData} type="button">
          <Icon name="upload" />
          Open Data
        </button>
      </div>
    </header>
  )
}
