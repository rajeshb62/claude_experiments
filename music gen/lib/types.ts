export type Track = {
  id: string
  title: string
  genres: string[]
  mood: string
  duration: number
  audioUrl: string
  createdAt: string
  prompt: string
}

export type GeneratorStatus = 'idle' | 'loading' | 'playing' | 'stopped' | 'error'
