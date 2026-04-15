'use client'
import { useState, useEffect, useRef } from 'react'

const SPEEDS = [
  { label: '0.75x', value: 0.75 },
  { label: '1x',    value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x',  value: 1.5 },
  { label: '2x',    value: 2 },
]

export default function SpeedControl({ status }: { status: string }) {
  const [speed, setSpeed] = useState(1)
  const baseBpm = useRef<number | null>(null)

  useEffect(() => {
    if (status !== 'playing') return
    const apply = async () => {
      const Tone = await import('tone')
      // Capture base BPM once when playback starts
      if (baseBpm.current === null) {
        baseBpm.current = Tone.getTransport().bpm.value
      }
      Tone.getTransport().bpm.value = baseBpm.current * speed
    }
    apply()
  }, [speed, status])

  // Reset base BPM capture when a new track starts
  useEffect(() => {
    if (status === 'loading') {
      baseBpm.current = null
      setSpeed(1)
    }
  }, [status])

  if (status === 'idle' || status === 'error') return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 mr-1">Speed</span>
      {SPEEDS.map((s) => (
        <button
          key={s.value}
          onClick={() => setSpeed(s.value)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            speed === s.value
              ? 'bg-accent text-white'
              : 'bg-surface text-slate-400 border border-border hover:border-accent hover:text-accent'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
