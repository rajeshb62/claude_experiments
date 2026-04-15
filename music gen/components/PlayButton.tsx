'use client'

type GeneratorStatus = 'idle' | 'loading' | 'playing' | 'stopped' | 'error'

type PlayButtonProps = {
  status: GeneratorStatus
  onPlay: () => void
  onStop: () => void
  elapsedTime: number
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PlayButton({ status, onPlay, onStop, elapsedTime }: PlayButtonProps) {
  const isLoading = status === 'loading'
  const isPlaying = status === 'playing'

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {/* Pulsing rings for loading */}
        {isLoading && (
          <>
            <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
            <div className="absolute -inset-2 rounded-full bg-accent/10 animate-ping animation-delay-150" />
          </>
        )}

        <button
          onClick={isPlaying ? onStop : onPlay}
          disabled={isLoading}
          className={`
            relative w-24 h-24 rounded-full flex items-center justify-center
            transition-all duration-300 shadow-xl
            ${isLoading
              ? 'bg-accent/50 cursor-not-allowed'
              : isPlaying
              ? 'bg-teal-500 hover:bg-teal-400 shadow-teal-500/30 hover:scale-105'
              : 'bg-accent hover:bg-accent-hover shadow-accent/30 hover:scale-105 active:scale-95'
            }
          `}
          aria-label={isPlaying ? 'Stop' : isLoading ? 'Generating...' : 'Generate'}
        >
          {isLoading ? (
            <svg
              className="w-8 h-8 text-white animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : isPlaying ? (
            /* Stop square */
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          ) : (
            /* Play triangle */
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      <div className="text-sm font-medium h-5">
        {isLoading && (
          <span className="text-accent animate-pulse">Generating...</span>
        )}
        {isPlaying && (
          <span className="text-teal-400 font-mono">{formatElapsed(elapsedTime)}</span>
        )}
      </div>
    </div>
  )
}
