import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sounddrop',
  description: 'AI-powered music generation. Create unique tracks with a single click.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-slate-200 antialiased">
        {children}
      </body>
    </html>
  )
}
