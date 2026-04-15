import { NextRequest, NextResponse } from 'next/server'

const MUSICGEN_SERVER = 'https://shark-trailers-win-struggle.trycloudflare.com/generate'

export async function POST(req: NextRequest) {
  let body: { prompt: string; duration: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { prompt, duration } = body
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  try {
    const res = await fetch(MUSICGEN_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, duration: duration || 15 }),
      signal: AbortSignal.timeout(600000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: `Colab error ${res.status}: ${text.slice(0, 300)}` }, { status: 500 })
    }
    const data = await res.json()
    return NextResponse.json({ audioUrl: data.audioUrl })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Generation timed out — Colab CPU is slow, try again' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Could not reach Colab server — is the tunnel still running?' }, { status: 503 })
  }
}
