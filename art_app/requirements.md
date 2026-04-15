# Colour Composition Analyser — Requirements

## Overview

Build a single-page web application that accepts an uploaded image and analyses its colour composition entirely in the browser. No external APIs, no AI services, no backend — pure client-side pixel analysis using the Canvas API and k-means clustering.

---

## Core Features

### 1. Image Upload
- Drag-and-drop zone or click-to-browse file input
- Accept: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`
- Show a live preview of the uploaded image after selection
- "Analyse another" button to reset and upload a new image

### 2. Colour Extraction (Canvas API + K-Means)
On image load:
1. Draw the image onto a hidden `<canvas>`, scaled down to max 120px on the longest side (for performance)
2. Read all pixel data via `ctx.getImageData()`
3. Sample up to 2000 pixels evenly across the image, skipping transparent pixels (alpha < 128)
4. Run **k-means clustering** with k=8 and 20 iterations to find the 8 dominant colour clusters
5. Sort clusters by weight (number of pixels assigned to each cluster), descending

### 3. Colour Analysis
For each dominant colour cluster compute:
- **Hex code** (e.g. `#A3C4BC`)
- **Human-readable name** derived from HSL values — e.g. "Muted blue", "Vivid red", "Light gray", "Dark green" — covering: Black, White, Gray shades, Red, Orange, Yellow, Yellow-green, Green, Cyan, Blue, Indigo, Violet, Pink, with modifiers: Dark / Light / Muted / Vivid
- **Percentage** of the image it represents (cluster weight / total sampled pixels × 100, rounded to nearest integer)

Also compute overall image stats from a weighted average across all clusters:
- **Brightness**: Dark (avg lightness < 35%), Mid (35–65%), Light (> 65%)
- **Saturation**: Muted (< 20%), Moderate (20–55%), Vibrant (> 55%)
- **Temperature**: Warm (avg red channel > avg blue channel), Cool (otherwise)
- **Colours found**: always 8

### 4. Results Display

#### Summary stat cards (2×2 grid)
- Colours found
- Brightness
- Saturation
- Temperature

#### Palette strip
- A single horizontal bar divided into 8 coloured segments
- Each segment's width is proportional to its percentage
- On hover: segment expands slightly (flex grow), shows a tooltip with hex + percentage
- On click: copies hex code to clipboard

#### Dominant colour list
- One row per colour showing:
  - A filled circle swatch
  - Colour name + hex code (monospace font)
  - A mini horizontal progress bar (width = percentage)
  - Percentage value
  - A brief "copied" confirmation tag on click
- Clicking a row copies the hex code to clipboard

#### Action buttons
- **Copy all hex codes** — copies all 8 hex codes as a comma-separated string
- **Analyse another** — resets the UI back to the upload state
- A flash "Copied!" confirmation message

---

## Tech Stack

- **Vanilla HTML + CSS + JavaScript** — no framework, no build step
- Single `index.html` file, everything inline
- Google Fonts: `DM Serif Display` (headings) + `DM Mono` (hex codes, stats) + `DM Sans` (body)
- No npm, no bundler, no external JS libraries

---

## UI Design

- **Theme**: Light background, clean and minimal. Colours in the palette provide all the visual interest.
- **Layout**: On desktop — image preview on the left (200px fixed), stats grid on the right. On mobile (< 520px) — single column.
- **Typography**: DM Serif Display for the main heading; DM Mono for hex codes and stat values; DM Sans for everything else.
- **Interactions**:
  - Drag-over state on the drop zone (dashed border darkens, background lightens)
  - Palette strip segments expand on hover (CSS flex transition)
  - Colour rows have a hover background tint
  - "Copied" tag fades in on click, fades out after 1.5s
  - Flash message for "Copy all" fades in/out after 2s
- **Empty state**: Centred drop zone with an upload icon, instruction text
- **No loading state needed** — analysis is near-instant in the browser

---

## Algorithm Details

### K-Means Clustering
```
function kmeans(pixels, k=8, iterations=20):
  initialise k centers by picking k random pixels
  repeat iterations times:
    assign each pixel to its nearest center (euclidean distance in RGB space)
    recalculate each center as the mean RGB of all pixels assigned to it
  return clusters with their center RGB and pixel count (weight)
```

### Colour Naming (HSL-based)
```
convert RGB → HSL
if L < 10%  → "Black"
if L > 90%  → "White"
if S < 12%  → "Dark/Mid/Light gray" based on L
else:
  map H to: Red (< 15° or ≥ 345°), Orange (15–35°), Yellow (35–65°),
            Yellow-green (65–80°), Green (80–150°), Cyan (150–185°),
            Blue (185–255°), Indigo (255–285°), Violet (285–315°), Pink (315–345°)
  apply modifier:
    S < 35%  → "Muted {hue}"
    L < 28%  → "Dark {hue}"
    L > 72%  → "Light {hue}"
    S > 75%  → "Vivid {hue}"
    else     → "{hue}" (no modifier)
```

### Foreground contrast for swatches
```
lum = 0.299×R + 0.587×G + 0.114×B
if lum > 160 → use dark text (#333333)
else         → use light text (#FFFFFF)
```

---

## File Structure

```
colour-analyser/
└── index.html   ← entire app in one file (HTML + CSS + JS inline)
```

---

## Constraints

- Must work by opening `index.html` directly in a browser (no server required)
- No API keys, no network requests (except Google Fonts CDN)
- Must handle images of any aspect ratio
- Must skip fully transparent pixels when sampling
- Canvas pixel sampling should be capped at 2000 points for performance on large images
