'use client'

type DurationSliderProps = {
  value: number
  onChange: (value: number) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

export default function DurationSlider({ value, onChange }: DurationSliderProps) {
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">Duration</span>
        <span className="text-sm font-semibold text-accent">{formatDuration(value)}</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={5}
          max={300}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1 accent-accent"
          style={{
            background: `linear-gradient(to right, #7F77DD ${((value - 5) / (300 - 5)) * 100}%, #1e1e2e ${((value - 5) / (300 - 5)) * 100}%)`,
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>5s</span>
        <span>1m 15s</span>
        <span>2m 30s</span>
        <span>5m</span>
      </div>
    </div>
  )
}
