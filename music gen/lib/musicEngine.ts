// lib/musicEngine.ts
// Browser-only — import dynamically with { ssr: false }

import * as Tone from 'tone'

// ─── Mood config ────────────────────────────────────────────────────────────

type MoodConfig = {
  bpm: number
  scale: 'major' | 'minor'
  velocity: number
}

const MOOD_CONFIGS: Record<string, MoodConfig> = {
  Calm:        { bpm: 72,  scale: 'major', velocity: 0.45 },
  Energetic:   { bpm: 128, scale: 'major', velocity: 0.8  },
  Dark:        { bpm: 88,  scale: 'minor', velocity: 0.6  },
  Uplifting:   { bpm: 110, scale: 'major', velocity: 0.7  },
  Melancholic: { bpm: 76,  scale: 'minor', velocity: 0.5  },
}

// ─── Scales ─────────────────────────────────────────────────────────────────

const SCALES: Record<string, number[]> = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function scaleToNotes(scaleDef: number[], octave: number): string[] {
  return scaleDef.map(n => NOTE_NAMES[n] + octave)
}

// ─── Chord progressions ──────────────────────────────────────────────────────

const MAJOR_CHORDS: string[][] = [
  ['C4', 'E4', 'G4'],   // I
  ['G3', 'B3', 'D4'],   // V
  ['A3', 'C4', 'E4'],   // vi
  ['F3', 'A3', 'C4'],   // IV
]

const MINOR_CHORDS: string[][] = [
  ['C4', 'Eb4', 'G4'],   // i
  ['Ab3', 'C4', 'Eb4'],  // VI
  ['Eb4', 'G4', 'Bb4'],  // III
  ['Bb3', 'D4', 'F4'],   // VII
]

const MAJOR_BASS: string[] = ['C2', 'G2', 'A2', 'F2']
const MINOR_BASS: string[] = ['C2', 'Ab2', 'Eb2', 'Bb2']

// ─── Helper to dispose array of Tone nodes ──────────────────────────────────

function disposeAll(nodes: Tone.ToneAudioNode[]) {
  for (const node of nodes) {
    try { node.dispose() } catch { /* ignore */ }
  }
}

// ─── Schedule events using Transport.schedule ─────────────────────────────

type ChordEvent = { time: number; chord: string[] }
type NoteEvent  = { time: number; note: string }
type DrumEvent  = { time: number; kick: boolean; snare: boolean; hat: boolean }

function scheduleChords(
  events: ChordEvent[],
  fn: (time: number, chord: string[]) => void,
): number[] {
  return events.map(ev =>
    Tone.getTransport().schedule((time) => fn(time, ev.chord), ev.time)
  )
}

function scheduleNotes(
  events: NoteEvent[],
  fn: (time: number, note: string) => void,
): number[] {
  return events.map(ev =>
    Tone.getTransport().schedule((time) => fn(time, ev.note), ev.time)
  )
}

function scheduleDrums(
  events: DrumEvent[],
  fn: (time: number, ev: { kick: boolean; snare: boolean; hat: boolean }) => void,
): number[] {
  return events.map(ev =>
    Tone.getTransport().schedule((time) => fn(time, ev), ev.time)
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function startMusicGeneration(
  genres: string[],
  mood: string,
  duration: number,
  onReady: () => void,
  onComplete: (audioUrl: string) => void,
): Promise<{ stop: () => void }> {

  await Tone.start()

  const moodConfig = MOOD_CONFIGS[mood] ?? MOOD_CONFIGS['Calm']
  const { bpm, scale, velocity } = moodConfig
  const genre = genres[0] ?? 'Lo-fi'

  Tone.getTransport().bpm.value = bpm
  Tone.getTransport().cancel()
  Tone.getTransport().loop = true
  Tone.getTransport().loopEnd = duration

  const chords = scale === 'major' ? MAJOR_CHORDS : MINOR_CHORDS
  const bassNotes = scale === 'major' ? MAJOR_BASS : MINOR_BASS

  const allNodes: Tone.ToneAudioNode[] = []

  // ─── Recorder ───────────────────────────────────────────────────────────
  const recorder = new Tone.Recorder()
  Tone.getDestination().connect(recorder)
  allNodes.push(recorder)

  let stopped = false
  let recorderStopped = false

  function stop() {
    if (stopped) return
    stopped = true
    try { Tone.getTransport().stop() } catch { /* ignore */ }
    try { Tone.getTransport().cancel() } catch { /* ignore */ }
    if (!recorderStopped) {
      recorderStopped = true
      recorder.stop().catch(() => {})
    }
    disposeAll(allNodes)
  }

  // Shared timing helper
  const sixteenth = Tone.Time('16n').toSeconds()
  const barDur = sixteenth * 16
  const totalBars = Math.ceil(duration / barDur) + 2

  // ─── Build instruments based on genre ───────────────────────────────────

  if (genre === 'Ambient') {
    const reverb = new Tone.Reverb({ decay: 8, wet: 0.9 }).toDestination()
    const delay = new Tone.FeedbackDelay('8n', 0.4).connect(reverb)
    delay.wet.value = 0.5
    allNodes.push(reverb, delay)

    const pad = new Tone.AMSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 4, decay: 1, sustain: 0.8, release: 6 },
      volume: -8,
    }).connect(delay)
    allNodes.push(pad)

    // chord changes every 4 bars
    const ambBarDur = barDur * 4
    const ambTotalBars = Math.ceil(duration / ambBarDur) + 2
    const chordEvents: ChordEvent[] = []
    for (let bar = 0; bar < ambTotalBars; bar++) {
      chordEvents.push({ time: bar * ambBarDur, chord: chords[bar % 4] })
    }

    scheduleChords(chordEvents, (time, chord) => {
      pad.triggerAttackRelease(chord[1], ambBarDur * 3.8, time, velocity)
    })

  } else if (genre === 'Classical') {
    const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.5 }).toDestination()
    allNodes.push(reverb)

    const piano = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 1.2 },
      volume: -10,
    }).connect(reverb)
    allNodes.push(piano)

    const arpEvents: NoteEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      const chord = chords[bar % 4]
      const arpPattern = [
        chord[0], chord[1], chord[2], chord[1],
        chord[0], chord[2], chord[1], chord[0],
        chord[2], chord[1], chord[0], chord[2],
        chord[1], chord[0], chord[2], chord[1],
      ]
      for (let step = 0; step < 16; step++) {
        arpEvents.push({ time: bar * barDur + step * sixteenth, note: arpPattern[step] })
      }
    }

    scheduleNotes(arpEvents, (time, note) => {
      piano.triggerAttackRelease(note, '16n', time, velocity)
    })

  } else if (genre === 'Jazz') {
    const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 }).toDestination()
    allNodes.push(reverb)

    const piano = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.8 },
      volume: -10,
    }).connect(reverb)
    allNodes.push(piano)

    const bass = new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
      volume: -12,
    }).connect(reverb)
    allNodes.push(bass)

    const hihat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.08, release: 0.05 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -24,
    }).connect(reverb)
    hihat.frequency.value = 400
    allNodes.push(hihat)

    const beatDur = barDur / 4
    const jazz7thExtensions = ['B4', 'F4', 'G4', 'Eb4']

    // Chord voicings every bar
    const chordEvents: Array<{ time: number; chord: string[]; ext: string }> = []
    for (let bar = 0; bar < totalBars; bar++) {
      const ci = bar % 4
      chordEvents.push({ time: bar * barDur, chord: chords[ci], ext: jazz7thExtensions[ci] })
    }
    chordEvents.forEach(ev => {
      Tone.getTransport().schedule((time) => {
        piano.triggerAttackRelease([...ev.chord, ev.ext], '2n', time, velocity * 0.85)
      }, ev.time)
    })

    // Walking bass
    const bassEvents: NoteEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      const ci = bar % 4
      const nextCi = (bar + 1) % 4
      const walkNotes = [bassNotes[ci], bassNotes[ci], bassNotes[nextCi], bassNotes[ci]]
      for (let beat = 0; beat < 4; beat++) {
        bassEvents.push({ time: bar * barDur + beat * beatDur, note: walkNotes[beat] })
      }
    }
    scheduleNotes(bassEvents, (time, note) => {
      bass.triggerAttackRelease(note, '4n', time, velocity * 0.7)
    })

    // Swung hi-hat — skip beat 2
    const hihatEvents: NoteEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        if (beat !== 1) {
          hihatEvents.push({ time: bar * barDur + beat * beatDur, note: 'hit' })
        }
        if (beat === 0 || beat === 2) {
          hihatEvents.push({ time: bar * barDur + beat * beatDur + beatDur * 0.67, note: 'hit' })
        }
      }
    }
    scheduleNotes(hihatEvents, (time) => {
      hihat.triggerAttackRelease('16n', time, 0.3)
    })

  } else if (genre === 'Electronic') {
    const chorus = new Tone.Chorus(4, 2.5, 0.5).toDestination()
    chorus.start()
    const autoFilter = new Tone.AutoFilter('8n').connect(chorus)
    autoFilter.start()
    const reverb = new Tone.Reverb({ decay: 1.2, wet: 0.25 }).connect(autoFilter)
    allNodes.push(chorus, autoFilter, reverb)

    const lead = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 },
      volume: -14,
    }).connect(reverb)
    allNodes.push(lead)

    const subBass = new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.8, release: 0.3 },
      volume: -10,
    }).toDestination()
    allNodes.push(subBass)

    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
      volume: -6,
    }).toDestination()
    allNodes.push(kick)

    const hihat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -22,
    }).toDestination()
    hihat.frequency.value = 400
    allNodes.push(hihat)

    // 4-on-the-floor kick, 8th hihat
    const kickSteps  = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]
    const hihatSteps = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]

    const drumEvents: DrumEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      for (let step = 0; step < 16; step++) {
        drumEvents.push({
          time: bar * barDur + step * sixteenth,
          kick: kickSteps[step] === 1,
          snare: false,
          hat: hihatSteps[step] === 1,
        })
      }
    }
    scheduleDrums(drumEvents, (time, ev) => {
      if (ev.kick) kick.triggerAttackRelease('C1', '8n', time)
      if (ev.hat) hihat.triggerAttackRelease('16n', time, 0.4)
    })

    // Lead melody following chord tones
    const leadEvents: NoteEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      const chord = chords[bar % 4]
      for (let beat = 0; beat < 4; beat++) {
        if (beat % 2 === 0) {
          leadEvents.push({ time: bar * barDur + beat * sixteenth * 4, note: chord[beat % chord.length] })
        }
      }
    }
    scheduleNotes(leadEvents, (time, note) => {
      lead.triggerAttackRelease(note, '8n', time, velocity)
    })

    // Sub bass
    const bassEvents: NoteEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      const ci = bar % 4
      bassEvents.push({ time: bar * barDur, note: bassNotes[ci] })
      bassEvents.push({ time: bar * barDur + barDur / 2, note: bassNotes[ci] })
    }
    scheduleNotes(bassEvents, (time, note) => {
      subBass.triggerAttackRelease(note, '4n', time, velocity * 0.9)
    })

  } else if (genre === 'Cinematic') {
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.7 }).toDestination()
    allNodes.push(reverb)

    const strings = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 1.5, decay: 0.5, sustain: 0.9, release: 2.0 },
      volume: -10,
    }).connect(reverb)
    allNodes.push(strings)

    const dramaDrum = new Tone.MembraneSynth({
      pitchDecay: 0.2,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.5 },
      volume: -8,
    }).connect(reverb)
    allNodes.push(dramaDrum)

    // Chord changes every 2 bars
    const chordEvents: ChordEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      const ci = Math.floor(bar / 2) % 4
      chordEvents.push({ time: bar * barDur, chord: chords[ci] })
    }
    scheduleChords(chordEvents, (time, chord) => {
      strings.triggerAttackRelease(chord, '1m', time, velocity)
    })

    // Dramatic hits every 4 bars
    const hitEvents: NoteEvent[] = []
    for (let bar = 0; bar < totalBars; bar += 4) {
      hitEvents.push({ time: bar * barDur, note: 'C2' })
    }
    scheduleNotes(hitEvents, (time, note) => {
      dramaDrum.triggerAttackRelease(note, '4n', time, velocity * 0.8)
    })

  } else if (genre === 'World') {
    const reverb = new Tone.Reverb({ decay: 2, wet: 0.45 }).toDestination()
    allNodes.push(reverb)

    const melody = new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.4 },
      volume: -12,
    }).connect(reverb)
    allNodes.push(melody)

    const handDrum = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 },
      volume: -12,
    }).connect(reverb)
    allNodes.push(handDrum)

    const penta = scaleToNotes(SCALES.pentatonic, 4)

    // Pentatonic melodic phrases
    const melEvents: NoteEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        const noteIdx = (bar * 3 + beat * 2) % penta.length
        melEvents.push({ time: bar * barDur + beat * sixteenth * 4, note: penta[noteIdx] })
      }
    }
    scheduleNotes(melEvents, (time, note) => {
      melody.triggerAttackRelease(note, '4n', time, velocity)
    })

    // Hand drum pattern
    const drumSteps = [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0]
    const drumVelMap = [0.8,0,0,0.5, 0,0.5,0,0, 0.8,0,0,0.5, 0,0.5,0,0]
    const worldDrumEvents: Array<{ time: number; vel: number }> = []
    for (let bar = 0; bar < totalBars; bar++) {
      for (let step = 0; step < 16; step++) {
        if (drumSteps[step]) {
          worldDrumEvents.push({ time: bar * barDur + step * sixteenth, vel: drumVelMap[step] })
        }
      }
    }
    worldDrumEvents.forEach(ev => {
      Tone.getTransport().schedule((time) => {
        handDrum.triggerAttackRelease('G3', '16n', time, ev.vel)
      }, ev.time)
    })

  } else if (genre === 'Hip-hop') {
    const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 }).toDestination()
    allNodes.push(reverb)

    const chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.5 },
      volume: -12,
    }).connect(reverb)
    allNodes.push(chordSynth)

    const bass808 = new Tone.MembraneSynth({
      pitchDecay: 0.5,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.8, sustain: 0.1, release: 0.5 },
      volume: -6,
    }).toDestination()
    allNodes.push(bass808)

    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.1,
      octaves: 8,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
      volume: -6,
    }).toDestination()
    allNodes.push(kick)

    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      volume: -14,
    }).toDestination()
    allNodes.push(snare)

    const hihat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -24,
    }).toDestination()
    hihat.frequency.value = 400
    allNodes.push(hihat)

    // Boom bap drums
    const kickSteps  = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]
    const snareSteps = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]
    const hihatSteps = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]

    const drumEvents: DrumEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      for (let step = 0; step < 16; step++) {
        drumEvents.push({
          time: bar * barDur + step * sixteenth,
          kick: kickSteps[step] === 1,
          snare: snareSteps[step] === 1,
          hat: hihatSteps[step] === 1,
        })
      }
    }
    scheduleDrums(drumEvents, (time, ev) => {
      if (ev.kick) kick.triggerAttackRelease('C1', '8n', time)
      if (ev.snare) snare.triggerAttackRelease('8n', time, 0.6)
      if (ev.hat) hihat.triggerAttackRelease('16n', time, 0.35)
    })

    // Chords every 2 bars + 808 bass
    for (let bar = 0; bar < totalBars; bar += 2) {
      const ci = Math.floor(bar / 2) % 4
      const evTime = bar * barDur
      const evChord = chords[ci]
      const evBass = bassNotes[ci]
      Tone.getTransport().schedule((time) => {
        chordSynth.triggerAttackRelease(evChord, '2n', time, velocity * 0.8)
        bass808.triggerAttackRelease(evBass, '2n', time, velocity * 0.9)
      }, evTime)
    }

  } else {
    // Lo-fi (default)
    const reverb = new Tone.Reverb({ decay: 3, wet: 0.6 }).toDestination()
    const chorus = new Tone.Chorus(2, 1.5, 0.4).connect(reverb)
    chorus.start()
    allNodes.push(reverb, chorus)

    const piano = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.03, decay: 0.4, sustain: 0.6, release: 1.0 },
      volume: -10,
    }).connect(chorus)
    allNodes.push(piano)

    // Vinyl crackle: very quiet noise
    const crackle = new Tone.Noise('pink')
    const crackleGain = new Tone.Gain(0.015).toDestination()
    crackle.connect(crackleGain)
    crackle.start()
    allNodes.push(crackle, crackleGain)

    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 },
      volume: -16,
    }).connect(reverb)
    allNodes.push(kick)

    const hihat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.07, release: 0.03 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -28,
    }).connect(reverb)
    hihat.frequency.value = 400
    allNodes.push(hihat)

    // Chord changes every 2 bars
    const chordEvents: ChordEvent[] = []
    for (let bar = 0; bar < totalBars; bar += 2) {
      const ci = Math.floor(bar / 2) % 4
      chordEvents.push({ time: bar * barDur, chord: chords[ci] })
    }
    scheduleChords(chordEvents, (time, chord) => {
      piano.triggerAttackRelease(chord, '2n.', time, velocity)
    })

    // Kick on beats 1 & 3, lo-fi hihat every 8th with shuffle
    const kickSteps  = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]
    const hihatSteps = [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]

    const drumEvents: DrumEvent[] = []
    for (let bar = 0; bar < totalBars; bar++) {
      for (let step = 0; step < 16; step++) {
        // Shuffle: nudge every other 8th note slightly
        const shuffleOffset = (step % 4 === 2) ? sixteenth * 0.15 : 0
        drumEvents.push({
          time: bar * barDur + step * sixteenth + shuffleOffset,
          kick: kickSteps[step] === 1,
          snare: false,
          hat: hihatSteps[step] === 1,
        })
      }
    }
    scheduleDrums(drumEvents, (time, ev) => {
      if (ev.kick) kick.triggerAttackRelease('C1', '8n', time)
      if (ev.hat) hihat.triggerAttackRelease('16n', time, 0.3)
    })
  }

  // ─── Start transport & recorder ─────────────────────────────────────────
  recorder.start()
  Tone.getTransport().start()
  onReady()

  // ─── Stop recorder after one loop, but keep transport looping ───────────
  const stopTimeoutId = setTimeout(async () => {
    if (stopped || recorderStopped) return
    recorderStopped = true

    // Give recorder a brief moment to flush
    await new Promise(r => setTimeout(r, 500))

    try {
      const blob = await recorder.stop()
      const audioUrl = URL.createObjectURL(blob)
      onComplete(audioUrl)
    } catch (err) {
      console.error('Recorder stop error:', err)
    }
    // Transport keeps running — music loops until user clicks stop
  }, (duration + 0.5) * 1000)

  return {
    stop: () => {
      clearTimeout(stopTimeoutId)
      stop()
    },
  }
}
