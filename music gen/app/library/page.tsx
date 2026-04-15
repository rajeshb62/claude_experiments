'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { Track } from '@/lib/types'
import Header from '@/components/Header'
import TrackCard from '@/components/TrackCard'

export default function LibraryPage() {
  const router = useRouter()
  const { library, deleteTrack, remixTrack } = useStore()
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Hydrate library from localStorage
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])

  const handlePlay = (track: Track) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      if (playingUrl === track.audioUrl) {
        setPlayingUrl(null)
        return
      }
    }

    const audio = new Audio(track.audioUrl)
    audio.play()
    audioRef.current = audio
    setPlayingUrl(track.audioUrl)

    audio.addEventListener('ended', () => {
      setPlayingUrl(null)
      audioRef.current = null
    })
  }

  const handleDownload = async (track: Track) => {
    const timestamp = Date.now()
    const genreSlug = track.genres.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')
    const moodSlug = track.mood.toLowerCase()
    const filename = `sounddrop-${genreSlug}-${moodSlug}-${timestamp}.mp3`

    try {
      const response = await fetch(track.audioUrl)
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
      const a = document.createElement('a')
      a.href = track.audioUrl
      a.download = filename
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const handleRemix = (track: Track) => {
    remixTrack(track)
    router.push('/')
  }

  const handleDelete = (id: string) => {
    if (playingUrl) {
      audioRef.current?.pause()
      audioRef.current = null
      setPlayingUrl(null)
    }
    deleteTrack(id)
  }

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  return (
    <div className="min-h-screen bg-bg">
      <Header />

      <main className="max-w-5xl mx-auto px-4 pt-28 pb-20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-200">Your Library</h1>
            {hydrated && library.length > 0 && (
              <p className="text-slate-500 mt-1">{library.length} saved track{library.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
              bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
            New Track
          </Link>
        </div>

        {!hydrated ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : library.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-surface border border-border flex items-center justify-center">
              <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-400">No saved tracks yet</h2>
              <p className="text-slate-600 mt-1">Generate a track and save it to see it here</p>
            </div>
            <Link
              href="/"
              className="px-6 py-3 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Go to Generator
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {library.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                onPlay={handlePlay}
                onDownload={handleDownload}
                onRemix={handleRemix}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
