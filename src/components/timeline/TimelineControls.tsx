import { useTimeStore } from '../../store/timeStore'

const PLAYBACK_RATES = [0.5, 1, 2, 4, 10] as const

const formatCurrentTime = (timestamp: number): string =>
  `${new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')} UTC`

const formatExtentTime = (timestamp: number): string =>
  new Date(timestamp).toISOString().slice(11, 19)

export function TimelineControls() {
  const startTime = useTimeStore((state) => state.startTime)
  const endTime = useTimeStore((state) => state.endTime)
  const currentTime = useTimeStore((state) => state.currentTime)
  const playing = useTimeStore((state) => state.playing)
  const playbackRate = useTimeStore((state) => state.playbackRate)
  const rangeIsEmpty = startTime === endTime

  return (
    <section aria-label="Timeline and playback" className="timeline-panel">
      <div className="timeline-toolbar">
        <div aria-label="Playback controls" className="transport-controls">
          <button
            aria-label="Jump to start"
            className="transport-button"
            disabled={rangeIsEmpty}
            onClick={() => useTimeStore.getState().setCurrentTime(startTime)}
            type="button"
          >
            Start
          </button>
          <button
            aria-label={playing ? 'Pause playback' : 'Play timeline'}
            className="transport-button transport-button-primary"
            disabled={rangeIsEmpty}
            onClick={() => {
              const state = useTimeStore.getState()
              if (state.playing) state.pause()
              else state.play()
            }}
            type="button"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            aria-label="Jump to end"
            className="transport-button"
            disabled={rangeIsEmpty}
            onClick={() => useTimeStore.getState().setCurrentTime(endTime)}
            type="button"
          >
            End
          </button>
        </div>

        <time
          className="timeline-current-time"
          dateTime={new Date(currentTime).toISOString()}
        >
          {formatCurrentTime(currentTime)}
        </time>

        <label className="playback-rate-control">
          <span>Speed</span>
          <select
            aria-label="Playback speed"
            onChange={(event) =>
              useTimeStore
                .getState()
                .setPlaybackRate(Number(event.currentTarget.value))
            }
            value={playbackRate}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="timeline-track">
        <input
          aria-label="Timeline position"
          disabled={rangeIsEmpty}
          max={endTime}
          min={startTime}
          onChange={(event) =>
            useTimeStore
              .getState()
              .setCurrentTime(Number(event.currentTarget.value))
          }
          step="1"
          type="range"
          value={currentTime}
        />
        <div aria-hidden="true" className="timeline-extents">
          <span>{formatExtentTime(startTime)}</span>
          <span>{formatExtentTime(endTime)}</span>
        </div>
      </div>
    </section>
  )
}
