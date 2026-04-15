'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import Header from '@/components/Header'
import GenreChip from '@/components/GenreChip'
import MoodButton from '@/components/MoodButton'
import DurationSlider from '@/components/DurationSlider'
import PlayButton from '@/components/PlayButton'
import WaveformPlayer from '@/components/WaveformPlayer'
import SaveButton from '@/components/SaveButton'
import DownloadButton from '@/components/DownloadButton'
import ErrorToast from '@/components/ErrorToast'
import VolumeSlider from '@/components/VolumeSlider'
import SpeedControl from '@/components/SpeedControl'

const GENRES = ['Lo-fi', 'Jazz', 'Ambient', 'Cinematic', 'Electronic', 'Classical', 'World', 'Hip-hop']
const MOODS = ['Calm', 'Energetic', 'Dark', 'Uplifting', 'Melancholic']

export default function GeneratorPage() {
  const {
    selectedGenres,
    selectedMood,
    duration,
    status,
    audioUrl,
    errorMessage,
    shakeGenres,
    library,
    toggleGenre,
    setMood,
    setDuration,
    generate,
    stop,
    saveTrack,
    clearError,
  } = useStore()

  const [elapsedTime, setElapsedTime] = useState(0)
  const [isSaved, setIsSaved] = useState(false)

  // Track elapsed time while playing
  useEffect(() => {
    if (status === 'playing') {
      setElapsedTime(0)
      const interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [status])

  // Reset saved state when a new track starts generating
  useEffect(() => {
    if (status === 'loading') {
      setIsSaved(false)
    }
  }, [status])

  const handleSave = () => {
    saveTrack()
    setIsSaved(true)
  }

  const showPlayer = status === 'loading' || status === 'playing' || status === 'stopped'
  const showSaveDownload = (status === 'playing' || status === 'stopped') && audioUrl

  return (
    <div className="min-h-screen bg-bg">
      <Header />

      <main className="max-w-2xl mx-auto px-4 pt-28 pb-20 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-accent to-purple-300 bg-clip-text text-transparent">
            Create Music with AI
          </h1>
          <p className="text-slate-400">Select your genres, set the mood, and generate a unique track</p>
        </div>

        {/* Genre Selection */}
        <section className="space-y-3">
          <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Choose Genres
          </label>
          <div
            className={`flex flex-wrap gap-2 ${shakeGenres ? 'animate-shake' : ''}`}
          >
            {GENRES.map((genre) => (
              <GenreChip
                key={genre}
                genre={genre}
                selected={selectedGenres.includes(genre)}
                onToggle={toggleGenre}
              />
            ))}
          </div>
          {selectedGenres.length === 0 && (
            <p className="text-xs text-slate-600">Select at least one genre to generate</p>
          )}
        </section>

        {/* Mood Selection */}
        <section className="space-y-3">
          <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Set the Mood
          </label>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((mood) => (
              <MoodButton
                key={mood}
                mood={mood}
                selected={selectedMood === mood}
                onSelect={setMood}
              />
            ))}
          </div>
        </section>

        {/* Duration Slider */}
        <section className="space-y-3">
          <DurationSlider value={duration} onChange={setDuration} />
        </section>

        {/* Play Button + Volume */}
        <div className="flex flex-col items-center gap-4 py-4">
          <PlayButton
            status={status}
            onPlay={generate}
            onStop={stop}
            elapsedTime={elapsedTime}
          />
          <VolumeSlider />
          <SpeedControl status={status} />
        </div>

        {/* Prompt preview */}
        {status === 'loading' && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs text-slate-500 font-mono leading-relaxed">
              {useStore.getState().currentPrompt}
            </p>
          </div>
        )}

        {/* Waveform Player */}
        {showPlayer && (
          <WaveformPlayer status={status} audioUrl={audioUrl} />
        )}

        {/* Save & Download */}
        {showSaveDownload && (
          <div className="flex flex-wrap items-center gap-3 justify-center">
            <SaveButton onSave={handleSave} saved={isSaved} />
            <DownloadButton
              audioUrl={audioUrl!}
              genres={selectedGenres}
              mood={selectedMood}
            />
          </div>
        )}
      </main>

      {/* Error Toast */}
      {errorMessage && (
        <ErrorToast message={errorMessage} onDismiss={clearError} />
      )}
    </div>
  )
}
