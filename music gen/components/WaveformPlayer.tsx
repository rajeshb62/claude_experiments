'use client'
import { useEffect, useRef } from 'react'

type Props = {
  status: string
  audioUrl: string | null
}

export default function WaveformPlayer({ status, audioUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)

  // Play / pause based on status
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    if (status === 'playing') {
      audio.loop = true
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [status, audioUrl])

  if (status === 'idle') return null

  if (status === 'loading') {
    return (
      <div className="w-full h-20 flex items-center justify-center gap-1">
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            className="w-1 bg-accent rounded-full animate-pulse-slow"
            style={{
              height: `${20 + Math.random() * 40}px`,
              animationDelay: `${i * 0.05}s`,
              opacity: 0.4,
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="w-full">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          className="w-full"
          controls
          loop
          style={{ accentColor: '#7F77DD' }}
        />
      )}
    </div>
  )
}
