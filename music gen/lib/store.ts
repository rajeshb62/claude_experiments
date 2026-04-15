import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { Track } from './types'
import { buildPrompt } from './buildPrompt'

type GeneratorStatus = 'idle' | 'loading' | 'playing' | 'stopped' | 'error'

type AppState = {
  selectedGenres: string[]
  selectedMood: string
  duration: number
  status: GeneratorStatus
  audioUrl: string | null
  currentPrompt: string | null
  errorMessage: string | null
  library: Track[]
  shakeGenres: boolean
  toggleGenre: (genre: string) => void
  setMood: (mood: string) => void
  setDuration: (duration: number) => void
  generate: () => Promise<void>
  stop: () => void
  saveTrack: () => void
  deleteTrack: (id: string) => void
  remixTrack: (track: Track) => void
  clearError: () => void
}

function loadLibrary(): Track[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('sounddrop_library')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function persistLibrary(library: Track[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('sounddrop_library', JSON.stringify(library))
  } catch {
    // ignore
  }
}

// Holds the engine's stop function between generate() and stop() calls
let stopEngineRef: (() => void) | null = null

export const useStore = create<AppState>((set, get) => ({
  selectedGenres: [],
  selectedMood: 'Calm',
  duration: 10,
  status: 'idle',
  audioUrl: null,
  currentPrompt: null,
  errorMessage: null,
  library: [],
  shakeGenres: false,

  toggleGenre: (genre: string) => {
    set({ selectedGenres: [genre] })
  },

  setMood: (mood: string) => set({ selectedMood: mood }),

  setDuration: (duration: number) => set({ duration }),

  generate: async () => {
    const { selectedGenres, selectedMood, duration } = get()

    if (selectedGenres.length === 0) {
      set({ shakeGenres: true })
      setTimeout(() => set({ shakeGenres: false }), 600)
      set({ errorMessage: 'Please select at least one genre.' })
      return
    }

    const prompt = buildPrompt(selectedGenres, selectedMood, duration)
    set({ status: 'loading', errorMessage: null, currentPrompt: prompt, audioUrl: null })

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Server error: ${res.status}`)
      }
      const data = await res.json()
      set({ audioUrl: data.audioUrl, status: 'playing' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate music'
      set({ status: 'error', errorMessage: message })
    }
  },

  stop: () => {
    if (stopEngineRef) {
      stopEngineRef()
      stopEngineRef = null
    }
    set({ status: 'stopped' })
  },

  saveTrack: () => {
    const { selectedGenres, selectedMood, duration, audioUrl, currentPrompt, library } = get()
    if (!audioUrl) return

    const track: Track = {
      id: uuidv4(),
      title: `${selectedGenres.join(' / ')} – ${selectedMood}`,
      genres: selectedGenres,
      mood: selectedMood,
      duration,
      audioUrl,
      createdAt: new Date().toISOString(),
      prompt: currentPrompt || '',
    }

    const updated = [track, ...library]
    persistLibrary(updated)
    set({ library: updated })
  },

  deleteTrack: (id: string) => {
    const { library } = get()
    const updated = library.filter((t) => t.id !== id)
    persistLibrary(updated)
    set({ library: updated })
  },

  remixTrack: (track: Track) => {
    set({
      selectedGenres: track.genres,
      selectedMood: track.mood,
      duration: track.duration,
      status: 'idle',
      audioUrl: null,
      currentPrompt: null,
      errorMessage: null,
    })
  },

  clearError: () => set({ errorMessage: null }),
}))

// Hydrate library from localStorage on client
if (typeof window !== 'undefined') {
  useStore.setState({ library: loadLibrary() })
}
