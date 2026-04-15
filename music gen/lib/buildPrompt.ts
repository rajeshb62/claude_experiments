const genreInstrumentation: Record<string, string> = {
  'Lo-fi': 'soft piano, vinyl crackle, dusty drums',
  Jazz: 'jazz piano, upright bass, brushed drums, saxophone',
  Ambient: 'pads, slow evolving textures, soft reverb',
  Cinematic: 'orchestral strings, brass, epic percussion',
  Electronic: 'synth leads, sub bass, electronic drums',
  Classical: 'piano, strings, chamber ensemble',
  World: 'ethnic instruments, world percussion, traditional melodies',
  'Hip-hop': 'boom bap drums, sampled bass, crisp snares',
}

const moodDescriptors: Record<string, { bpm: number; descriptors: string }> = {
  Calm: { bpm: 70, descriptors: 'mellow, relaxed, peaceful' },
  Energetic: { bpm: 128, descriptors: 'high energy, driving, intense' },
  Dark: { bpm: 90, descriptors: 'dark, brooding, tense' },
  Uplifting: { bpm: 110, descriptors: 'uplifting, bright, positive' },
  Melancholic: { bpm: 80, descriptors: 'melancholic, sad, wistful' },
}

export function buildPrompt(genres: string[], mood: string, duration: number): string {
  const instrumentationParts = genres.map((g) => genreInstrumentation[g] || g.toLowerCase())
  const moodData = moodDescriptors[mood] || { bpm: 90, descriptors: mood.toLowerCase() }

  const genreLabel = genres.length > 0 ? genres.join(' / ') : 'instrumental'
  const instrumentation = instrumentationParts.join(', ')

  const noVocals =
    genres.includes('Jazz') || genres.includes('World') ? '' : ', no vocals'

  const prompt = [
    `${genreLabel} music`,
    moodData.descriptors,
    instrumentation,
    `${moodData.bpm} BPM`,
    `${duration} seconds`,
    `high quality${noVocals}`,
  ]
    .filter(Boolean)
    .join(', ')

  return prompt
}
