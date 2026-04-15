'use client'

type GenreChipProps = {
  genre: string
  selected: boolean
  onToggle: (genre: string) => void
}

export default function GenreChip({ genre, selected, onToggle }: GenreChipProps) {
  return (
    <button
      onClick={() => onToggle(genre)}
      className={`
        px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200
        ${
          selected
            ? 'bg-accent text-white shadow-lg shadow-accent/30 scale-105'
            : 'bg-surface text-slate-400 hover:text-slate-200 hover:bg-border border border-border hover:border-accent/50'
        }
      `}
    >
      {genre}
    </button>
  )
}
