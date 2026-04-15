'use client'

type MoodButtonProps = {
  mood: string
  selected: boolean
  onSelect: (mood: string) => void
}

const moodEmoji: Record<string, string> = {
  Calm: '🌙',
  Energetic: '⚡',
  Dark: '🌑',
  Uplifting: '☀️',
  Melancholic: '🌧️',
}

export default function MoodButton({ mood, selected, onSelect }: MoodButtonProps) {
  return (
    <button
      onClick={() => onSelect(mood)}
      className={`
        flex flex-col items-center gap-1 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-200
        ${
          selected
            ? 'bg-accent text-white shadow-lg shadow-accent/30 scale-105 border border-accent'
            : 'bg-surface text-slate-400 hover:text-slate-200 border border-border hover:border-accent/50'
        }
      `}
    >
      <span className="text-lg">{moodEmoji[mood] || '🎵'}</span>
      <span>{mood}</span>
    </button>
  )
}
