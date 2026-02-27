# Indian Classical Melody Generator — Reference Document

**File:** `indian-melody.html` (single self-contained HTML file, no dependencies)
**Stack:** Vanilla JS · Web Audio API · CSS backdrop-filter

---

## Overview

A browser-based melody generator rooted in Indian classical music theory. It generates improvised melodic lines using just-intonation swara ratios, a tanpura drone, phrase breathing, and an anchor-note gravity system. A separate Sequence Player lets you input, loop, and continuously develop a hand-written note phrase.

---

## Swara System

### Just-intonation ratios (base: Sa = C4 = 261.63 Hz)

| Swara | Ratio  | Western equiv. |
|-------|--------|----------------|
| Sa    | 1/1    | C (tonic)      |
| r1    | 16/15  | Db (komal Re)  |
| r2    | 9/8    | D  (shuddha Re)|
| g1    | 6/5    | Eb (komal Ga)  |
| g2    | 5/4    | E  (shuddha Ga)|
| m1    | 4/3    | F  (shuddha Ma)|
| m2    | 45/32  | F# (tivra Ma)  |
| P     | 3/2    | G  (Panchama)  |
| d1    | 8/5    | Ab (komal Dha) |
| d2    | 5/3    | A  (shuddha Dha)|
| n1    | 9/5    | Bb (komal Ni)  |
| n2    | 15/8   | B  (shuddha Ni)|

Octaves 3, 4, 5 are generated. Octave 4 is weighted 2×, octave 3 is 1×, octave 5 is 0.65×. Sa and Pa get additional base weight (3× and 2× respectively) to emphasise tonic and dominant.

Default raga selection (checked on load): **Sa, r2, g2, P, d2** — a Bilawal-adjacent pentatonic.

---

## Audio Engine

### Oscillator + Envelope
Each note is a `sine` oscillator routed through a gain envelope:
- Attack: 20 ms linear ramp to 0.9
- Decay: 40 ms linear ramp to 0.65
- Sustain: held at 0.65 until 75 % of note duration
- Release: linear ramp to 0 at note end

Actual audio duration = `durationSec × 0.92` (8 % gap prevents note-to-note clicks).

### Gamak (vibrato)
Notes ≥ 0.9 s get an LFO at 5.5 Hz, 1.3 % depth in Hz, kicking in 120 ms after note onset. Implemented as a secondary oscillator → gain node → main oscillator's frequency input.

### Reverb
Convolution reverb built from a 1.8-second exponential-decay noise impulse response generated at runtime. Dry/wet mix: 72 % / 28 %.

### Tanpura Drone
Three sustained triangle oscillators at:
- Sa3 (130.8 Hz), Pa3 (196.2 Hz), Sa4 +2 cents (261.9 Hz)

Each at amplitude 0.05, faded in over 1.5 s via a linear ramp. Routed directly to `audioCtx.destination` (bypasses master gain so it is always audible regardless of volume slider). Toggled by the **Tanpura Drone** checkbox.

### Signal chain
```
oscillator → envelope gain → masterGain ──► dryGain (0.72) ──► destination
                                        └──► reverbNode ──► wetGain (0.28) ──► destination
tanpura oscillators ─────────────────────────────────────────► destination (direct)
```

---

## Random Melody Generator

### Note selection
`pickNextNote(pool, prev)`:
- **85 % stepwise**: pick uniformly from notes within 1–3 pool positions of previous
- **15 % leap**: pick uniformly from notes more than 3 pool positions away

### Duration
Four durations with weighted random selection:

| Symbol | Name    | Multiplier | Weight |
|--------|---------|------------|--------|
| ♪      | Eighth  | 0.5×       | 25     |
| ♩      | Quarter | 1.0×       | 45     |
| ♩.     | Dotted  | 1.5×       | 20     |
| 𝅗𝅥      | Half    | 2.0×       | 10     |

`durationSec = mult × (60 / BPM)`

### Phrase breathing
Every 5–8 notes the melody rests for a half-beat (`quarterSec × 0.5`) before the next phrase begins. A phrase boundary also increments `phrasesSinceHome`.

### Anchor note (gravity system)
Selectable per-swara radio button (octave 4 only). Three constants govern it:

| Constant | Value | Meaning |
|----------|-------|---------|
| `HOME_RETURN_PHRASES` | 2 | Force return every N phrase-ends |
| `HOME_PULL_THRESHOLD` | 6 | Notes away before weight boost |
| `HOME_PULL_MULT` | 5 | Weight multiplier during boost |

When `forceHome` is true the next note is always the anchor at octave 4, played as a half note (2× duration), and the phrase/away counters reset.

### Audio scheduling
The scheduler runs 50 ms ahead of the audio clock (`nextNoteTime - audioCtx.currentTime - 50 ms`). All visual updates (Now Playing display, history chips) are delayed by `(noteStartTime - audioCtx.currentTime) × 1000 ms` so the DOM updates fire when the note actually starts playing, not when it is scheduled.

---

## Note History

- Stores up to 20 most-recent notes (newest first).
- Each chip shows: `NoteName octave DurationSymbol` e.g. `Sa₄ ♩`
- The most-recent chip is highlighted gold (`.chip.recent`).
- Duration multiplier is stored alongside the note object (`{ ...note, durMult }`).

### Copy button
Writes a space-separated, BPM-prefixed sequence to the clipboard:
```
BPM=100 | Sa4:♩ g24:♪ P4:♩. Sa4:𝅗𝅥
```
Notes are reversed to chronological order before writing. This string is the direct input format for the Sequence Player.

---

## Sequence Player

### Input format
Space-separated tokens, one per note:
```
Sa4:♩  g24:♪  P4:♩.  n24:𝅗𝅥
```
Token grammar: `<swaraName><octave>:<durationSymbol>`
- `swaraName`: `Sa | r1 | r2 | g1 | g2 | m1 | m2 | P | d1 | d2 | n1 | n2`
- `octave`: `3 | 4 | 5`
- `durationSymbol`: `♪ ♩ ♩. 𝅗𝅥`

A `BPM=XX | ` prefix (from the Copy button) is accepted and parsed; the BPM overrides the slider for that session.

Live chip preview updates as you type.

### Play Loop
Plays the parsed phrase on repeat indefinitely. Visual chips update in sync with audio via an `requestAnimationFrame` loop that compares `audioCtx.currentTime` against each note's scheduled start time (compensated by `audioCtx.outputLatency || audioCtx.baseLatency`).

Each `seqSchedule` entry carries a snapshot `{ idx, startTime, note, total }` so the display is immune to mid-cycle phrase swaps.

---

## Develop Loop

### Algorithm: contour-preserving development

1. Each input note is located in the sorted swara pool (all octaves of currently checked swaras).
2. The **melodic contour** between consecutive notes is recorded as `dirs[i] = sign(pos[i] - pos[i-1])` — up (+1), down (−1), or same (0).
3. A random **start shift** of −2..+2 pool positions is applied to the first note.
4. Each subsequent note walks from the previous position following the **same direction** as the original, but with a random step size of 1–3 positions. 15 % chance of going the opposite direction to introduce tension.
5. The **last note** is constrained to ≤1 pool step from `origPos[lastIdx] + startShift` for harmonic coherence.
6. All durations are preserved exactly.

### Develop Loop mode
Clicking **✦ Develop loop** starts the Sequence Player in develop mode:
- Plays the current phrase once.
- At the end of each cycle (when `seqIndex` wraps to 0), `developPhrase(seqNotes)` is called and `seqNotes` is replaced with the result.
- The textarea updates (audio-clock delayed) to show the phrase currently playing.
- Clicking **■ Stop developing** or the **■ Stop** button halts everything and resets state.

Because each developed phrase is derived from the previous one, the melody evolves gradually — like live improvisation drifting from a seed phrase while retaining the rhythmic skeleton.

---

## Controls Reference

| Control | Range / Options | Default |
|---------|----------------|---------|
| BPM slider | 60 – 180 | 100 |
| Volume slider | 0 – 100 % | 70 % |
| Tanpura drone | on / off | on |
| Anchor note | None / any swara | None |
| Swara checkboxes | any subset of 12 | Sa r2 g2 P d2 |

---

## Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `swaraFreq(ratio, octaveOffset)` | JS | `SA_FREQ × ratio × 2^octaveOffset` |
| `buildNotePool()` | JS | Builds weighted array of `{name, freq, octave, weight}` from checked swaras |
| `pickNextNote(pool, prev)` | JS | Stepwise/leap weighted selection |
| `pickDuration()` | JS | Weighted random duration object |
| `playNote(freq, dur, startTime)` | JS | Schedules one oscillator+envelope on audio timeline |
| `scheduleNote()` | JS | Random melody scheduler (recursive via setTimeout) |
| `pushHistory(note, durMult)` | JS | Prepends to `noteHistory`, calls `renderHistory()` |
| `parseSequence(text)` | JS | Parses token string → `[{name,octave,freq,mult}]` |
| `formatPhrase(notes)` | JS | Converts note array → token string |
| `developPhrase(notes)` | JS | Contour-preserving variation (returns new note array) |
| `scheduleSeqNote()` | JS | Sequence player scheduler (recursive via setTimeout) |
| `seqVisualFrame()` | JS | rAF loop for chip highlighting, reads audio clock |
| `startDrone()` / `stopDrone()` | JS | Tanpura oscillator lifecycle |
| `buildReverb(ctx, duration)` | JS | Generates convolution reverb impulse response |
| `animateBars(playing)` | JS | Visualiser bar animation via rAF |

---

## Visual Sync Architecture

The app uses a **two-timer pattern** to keep visuals in sync with audio:

1. **Audio scheduler** (`setTimeout`, fires 50 ms early): calls `playNote()` and pushes a snapshot entry to `seqSchedule`. Never touches the DOM.
2. **Visual updater**:
   - *Random play*: a `setTimeout` keyed to `(noteStartTime - audioCtx.currentTime) × 1000 ms` fires DOM updates at audio-clock time.
   - *Sequence player*: a `requestAnimationFrame` loop polls `audioCtx.currentTime - outputLatency` each frame and highlights the entry whose `startTime` has just been passed.

This separation means scheduling jitter never causes the display to jump ahead of the audio.
