'use client'

type DownloadButtonProps = {
  audioUrl: string
  genres: string[]
  mood: string
}

export default function DownloadButton({ audioUrl, genres, mood }: DownloadButtonProps) {
  const handleDownload = async () => {
    const timestamp = Date.now()
    const genreSlug = genres.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')
    const moodSlug = mood.toLowerCase()
    const filename = `sounddrop-${genreSlug}-${moodSlug}-${timestamp}.mp3`

    try {
      const response = await fetch(audioUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Fallback: direct link
      const a = document.createElement('a')
      a.href = audioUrl
      a.download = filename
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
        bg-surface border border-border text-slate-300 hover:text-white
        hover:border-slate-500 transition-all duration-200"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      Download MP3
    </button>
  )
}
