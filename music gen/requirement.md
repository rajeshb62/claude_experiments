# Music Generation App — Requirements

## Overview

Build a web app called **Sounddrop** where users can generate original AI music with a single click. The user picks a genre and mood, presses Play, and music is generated and streamed back. Generated tracks can be saved to a local library, downloaded, or remixed.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State management**: Zustand
- **Audio playback + waveform**: wavesurfer.js
- **Music generation**: Replicate API (meta/musicgen model)
- **Storage**: localStorage for library (MVP), upgrade to Postgres + S3 later
- **Language**: TypeScript throughout

---

## Environment Variables

```
REPLICATE_API_TOKEN=your_token_here
```

---

## Pages & Routes

### `/` — Generator (main screen)
The primary screen. Everything needed to generate music lives here.

### `/library` — Saved Tracks
Grid of saved tracks with playback, download, delete, and remix actions.

---

## Core Features

### 1. Genre Selection
- Display genre chips in a horizontal scrollable row
- Genres: Lo-fi, Jazz, Ambient, Cinematic, Electronic, Classical, World, Hip-hop
- Multi-select allowed (combine genres in the prompt)
- At least one genre must be selected

### 2. Mood Selection
- Single-select row of mood buttons
- Moods: Calm, Energetic, Dark, Uplifting, Melancholic
- Default: Calm

### 3. Duration Slider
- Range: 15 seconds to 300 seconds (5 minutes)
- Default: 60 seconds
- Display current value as "Xs" or "Xm Xs"

### 4. Play / Stop Button
- Large, centered, prominent button
- States: Idle → Loading → Playing → Stopped
- When clicked in Idle state: build prompt, call API, begin playback
- When clicked in Playing state: stop audio, return to Idle
- Show a pulsing animation while loading/generating
- Show elapsed time while playing

### 5. Waveform Visualizer
- Display a waveform using wavesurfer.js once audio is ready
- Show an animated placeholder waveform during generation

### 6. Prompt Builder (internal, not UI)
Translate user selections into a text prompt for the Replicate API.

Examples:
- Lo-fi + Calm → `"relaxed lo-fi hip hop, soft piano, vinyl crackle, mellow, 72 BPM, no vocals"`
- Cinematic + Dark → `"dark cinematic orchestral score, strings, tension, dramatic, no lyrics"`
- Electronic + Energetic → `"high energy electronic dance music, synth leads, driving beat, 128 BPM"`

Build a `buildPrompt(genres: string[], mood: string, duration: number): string` utility function that constructs a rich descriptive prompt from the selections. Include BPM hints, instrumentation hints, and always end with `"no vocals"` unless genre is Jazz or World.

### 7. Replicate API Integration
- Model: `meta/musicgen`
- Input parameters:
  - `prompt`: built from user selections
  - `duration`: from slider (in seconds)
  - `model_version`: `"stereo-large"`
  - `output_format`: `"mp3"`
  - `normalization_strategy`: `"peak"`
- Poll for completion (Replicate returns a prediction ID, then poll until status is `succeeded`)
- On success: get the output audio URL and pass it to wavesurfer

Create a `/api/generate` POST route in Next.js that:
1. Accepts `{ prompt, duration }` in the request body
2. Calls Replicate to start the prediction
3. Polls until complete (max 120s timeout)
4. Returns `{ audioUrl: string }`

### 8. Save to Library
- After a track generates successfully, show a "Save" button
- Saved tracks stored in localStorage as an array of objects:
  ```ts
  type Track = {
    id: string           // uuid
    title: string        // auto-generated: "{Genre} {Mood} - {date}"
    genres: string[]
    mood: string
    duration: number
    audioUrl: string
    createdAt: string    // ISO timestamp
    prompt: string       // the full prompt used
  }
  ```
- Library persists across sessions

### 9. Download
- Button to download the current or saved track as an MP3 file
- Filename: `sounddrop-{genre}-{mood}-{timestamp}.mp3`

### 10. Library Page (`/library`)
- Grid of track cards (2 columns on mobile, 3 on desktop)
- Each card shows: title, genre badges, mood, duration, creation date
- Actions per card: Play, Download, Remix, Delete
- "Remix" navigates back to `/` with that track's genre/mood/duration pre-filled

---

## UI Design

### Visual Style
- Dark theme only: near-black background (`#0a0a0f`), dark surfaces
- Accent color: purple (`#7F77DD`)
- Secondary accents: teal for success states, amber for warnings
- Rounded corners throughout (12px on cards, 999px on chips/pills)
- Minimal — lots of whitespace, no clutter

### Layout (Generator page)
```
[Header: logo + nav to Library]

[Genre chips — scrollable row]

[Mood buttons — row]

[Duration slider]

[Play button — centered, large]

[Waveform — appears after generation starts]

[Save + Download buttons — appear after generation completes]
```

### Component List
- `GenreChip` — toggleable pill button
- `MoodButton` — single-select button  
- `DurationSlider` — range input with label
- `PlayButton` — large circular button with state-based icon and animation
- `WaveformPlayer` — wavesurfer.js wrapper component
- `TrackCard` — used in library grid
- `SaveButton` — appears post-generation
- `DownloadButton` — appears post-generation

---

## State (Zustand store)

```ts
type AppState = {
  // Generator
  selectedGenres: string[]
  selectedMood: string
  duration: number
  status: 'idle' | 'loading' | 'playing' | 'stopped' | 'error'
  audioUrl: string | null
  currentPrompt: string | null
  errorMessage: string | null

  // Library
  library: Track[]

  // Actions
  toggleGenre: (genre: string) => void
  setMood: (mood: string) => void
  setDuration: (duration: number) => void
  generate: () => Promise<void>
  stop: () => void
  saveTrack: () => void
  deleteTrack: (id: string) => void
  remixTrack: (track: Track) => void
}
```

---

## Error Handling

- If Replicate API call fails: show a toast error message, reset to Idle state
- If generation times out (>120s): show "Generation timed out, please try again"
- If no genre selected and Play is pressed: shake the genre row and show "Pick at least one genre"
- Network errors: show "Connection error — check your API token and try again"

---

## File Structure

```
/app
  /page.tsx              # Generator page
  /library/page.tsx      # Library page
  /api/generate/route.ts # Replicate API route

/components
  /GenreChip.tsx
  /MoodButton.tsx
  /DurationSlider.tsx
  /PlayButton.tsx
  /WaveformPlayer.tsx
  /TrackCard.tsx
  /SaveButton.tsx
  /DownloadButton.tsx
  /Header.tsx
  /ErrorToast.tsx

/lib
  /buildPrompt.ts        # Prompt builder utility
  /replicate.ts          # Replicate API wrapper
  /store.ts              # Zustand store
  /types.ts              # Shared TypeScript types

/styles
  /globals.css
```

---

## Build Order (suggested for Claude Code)

1. Set up Next.js project with Tailwind and TypeScript
2. Create types and Zustand store
3. Build `buildPrompt` utility with test cases
4. Build the Replicate API route (`/api/generate`)
5. Build individual UI components (GenreChip, MoodButton, DurationSlider, PlayButton)
6. Wire the Generator page together
7. Add WaveformPlayer with wavesurfer.js
8. Add Save / Download functionality
9. Build the Library page with TrackCard
10. Polish: loading animations, error states, transitions

---

## MVP Scope (what to build first)

Focus only on:
- Generator page with genre, mood, duration, play button
- Replicate API integration
- Audio playback (no waveform required for MVP — basic `<audio>` element is fine)
- Save to localStorage
- Download button

Skip for MVP: library page, remix, waveform visualizer, error toasts. Add those after the core loop works.

---

## Notes for Claude Code

- Use `fetch` to poll the Replicate API — do not use the Replicate SDK (keep dependencies minimal)
- The Replicate token must only be used server-side (in the API route), never exposed to the client
- wavesurfer.js must be imported dynamically (`dynamic(() => import(...), { ssr: false })`) since it uses browser APIs
- All components should be client components (`"use client"`) except the API route
- Use `uuid` package for generating track IDs
- Keep the design dark-themed from the start — don't build light mode