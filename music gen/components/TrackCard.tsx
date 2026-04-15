'use client'

import { Track } from '@/lib/types'

type TrackCardProps = {
  track: Track
  onPlay: (track: Track) => void
  onDownload: (track: Track) => void
  onRemix: (track: Track) => void
  onDelete: (id: string) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function TrackCard({
  track,
  onPlay,
  onDownload,
  onRemix,
  onDelete,
}: TrackCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-accent/30 transition-all duration-200">
      {/* Title */}
      <div>
        <h3 className="font-semibold text-slate-200 truncate">{track.title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{formatDate(track.createdAt)}</p>
      </div>

      {/* Genre badges */}
      <div className="flex flex-wrap gap-1.5">
        {track.genres.map((g) => (
          <span
            key={g}
            className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30"
          >
            {g}
          </span>
        ))}
      </div>

      {/* Mood & Duration */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
          </svg>
          {track.mood}
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatDuration(track.duration)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        {/* Play */}
        <button
          onClick={() => onPlay(track)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
            bg-accent/20 text-accent hover:bg-accent hover:text-white transition-all duration-200"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          Play
        </button>

        {/* Download */}
        <button
          onClick={() => onDownload(track)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-border transition-all duration-200"
          title="Download"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        {/* Remix */}
        <button
          onClick={() => onRemix(track)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-accent/10 transition-all duration-200"
          title="Remix"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(track.id)}
          className="ml-auto p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all duration-200"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}
