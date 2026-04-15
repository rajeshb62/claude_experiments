'use client'
import { useEffect, useState } from 'react'

export default function VolumeSlider() {
  const [volume, setVolume] = useState(80)

  useEffect(() => {
    const apply = async () => {
      const Tone = await import('tone')
      // Convert 0-100 to dB: 100 → 0dB, 50 → -20dB, 0 → -Infinity (mute)
      if (volume === 0) {
        Tone.getDestination().volume.value = -Infinity
      } else {
        Tone.getDestination().volume.value = 20 * Math.log10(volume / 100)
      }
    }
    apply()
  }, [volume])

  return (
    <div className="flex items-center gap-3">
      {/* Mute icon */}
      <svg className="w-4 h-4 text-slate-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
      </svg>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="w-28 h-1 accent-accent"
        style={{
          background: `linear-gradient(to right, #7F77DD ${volume}%, #1e1e2e ${volume}%)`,
        }}
      />
      {/* Full volume icon */}
      <svg className="w-4 h-4 text-slate-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
      </svg>
    </div>
  )
}
