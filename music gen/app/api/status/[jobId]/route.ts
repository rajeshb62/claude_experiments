import { NextRequest, NextResponse } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const res = await fetch(`http://localhost:8000/status/${params.jobId}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      return NextResponse.json({ status: 'error', error: 'Job not found' }, { status: 404 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ status: 'error', error: 'Could not reach MusicGen server' }, { status: 503 })
  }
}
