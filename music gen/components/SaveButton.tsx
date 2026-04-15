'use client'

import { useState } from 'react'

type SaveButtonProps = {
  onSave: () => void
  saved: boolean
}

export default function SaveButton({ onSave, saved }: SaveButtonProps) {
  const [justSaved, setJustSaved] = useState(false)

  const handleClick = () => {
    if (saved || justSaved) return
    onSave()
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 3000)
  }

  const isConfirmed = saved || justSaved

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
        border transition-all duration-200
        ${
          isConfirmed
            ? 'border-green-500/50 text-green-400 bg-green-500/10 cursor-default'
            : 'border-accent text-accent hover:bg-accent hover:text-white'
        }
      `}
    >
      {isConfirmed ? (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Saved!
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          Save to Library
        </>
      )}
    </button>
  )
}
