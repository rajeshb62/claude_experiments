# Claude Summarization Prompt Template

## System Prompt

```
You are an expert at summarizing YouTube video transcripts into clear, structured key points.
Always respond with valid JSON only — no markdown, no prose outside the JSON object.
```

## User Prompt Template

```
Summarize the following YouTube video transcript into exactly {{COUNT}} key points.

Rules:
- Each point must be a concise, self-contained insight or takeaway from the video.
- If timestamps are available in the transcript, include the most relevant timestamp for each point as "timestamp" (format: "MM:SS" or "HH:MM:SS"). If no timestamps are available, set "timestamp" to null.
- Do not fabricate information not present in the transcript.
- Keep each point under 2 sentences.

Respond with this exact JSON structure:
{
  "title": "<inferred video title or topic in 10 words or less>",
  "length": "{{LENGTH_LABEL}}",
  "points": [
    { "index": 1, "timestamp": "MM:SS or null", "text": "Key point text." },
    ...
  ]
}

Transcript:
{{TRANSCRIPT}}
```

## Variable Reference

| Variable | Description | Example |
|---|---|---|
| `{{COUNT}}` | Number of key points | `3`, `5`, or `7` |
| `{{LENGTH_LABEL}}` | Human-readable length label | `"short"`, `"medium"`, `"long"` |
| `{{TRANSCRIPT}}` | Full transcript text with optional timestamps | `[00:12] Welcome to the video...` |

## Example Filled Prompt (Medium, 5 points)

```
Summarize the following YouTube video transcript into exactly 5 key points.

Rules:
- Each point must be a concise, self-contained insight or takeaway from the video.
- If timestamps are available in the transcript, include the most relevant timestamp for each point as "timestamp" (format: "MM:SS" or "HH:MM:SS"). If no timestamps are available, set "timestamp" to null.
- Do not fabricate information not present in the transcript.
- Keep each point under 2 sentences.

Respond with this exact JSON structure:
{
  "title": "<inferred video title or topic in 10 words or less>",
  "length": "medium",
  "points": [
    { "index": 1, "timestamp": "MM:SS or null", "text": "Key point text." },
    ...
  ]
}

Transcript:
[00:05] Hey everyone, welcome back to the channel...
[00:30] Today we're going to talk about React performance...
...
```

## Expected Response

```json
{
  "title": "React Performance Optimization Tips",
  "length": "medium",
  "points": [
    { "index": 1, "timestamp": "00:30", "text": "React performance issues often stem from unnecessary re-renders, which can be prevented with useMemo and useCallback." },
    { "index": 2, "timestamp": "02:15", "text": "Code splitting with React.lazy and Suspense reduces initial bundle size significantly." },
    { "index": 3, "timestamp": "05:40", "text": "Virtualizing long lists using libraries like react-window avoids rendering off-screen DOM nodes." },
    { "index": 4, "timestamp": "09:10", "text": "Profiling with React DevTools Profiler tab helps identify the exact components causing slowdowns." },
    { "index": 5, "timestamp": "13:00", "text": "Server-side rendering or static generation can dramatically improve perceived load time for users." }
  ]
}
```

## API Call Parameters

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1024,
  "system": "<system prompt above>",
  "messages": [
    { "role": "user", "content": "<filled user prompt above>" }
  ]
}
```
