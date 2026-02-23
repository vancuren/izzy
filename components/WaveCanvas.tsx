'use client'

import { useEffect, useRef } from 'react'
import { WaveRenderer } from '@/lib/canvas/wave-renderer'
import { AgentState, DARK_CONFIG, LIGHT_CONFIG } from '@/lib/canvas/types'

interface WaveCanvasProps {
  state: AgentState
  audioLevel: number
}

export function WaveCanvas({ state, audioLevel }: WaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<WaveRenderer | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const renderer = new WaveRenderer(canvasRef.current)
    rendererRef.current = renderer

    // Check theme
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    renderer.setConfig(isDark ? DARK_CONFIG : LIGHT_CONFIG)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      renderer.setConfig(e.matches ? DARK_CONFIG : LIGHT_CONFIG)
    }
    mediaQuery.addEventListener('change', handleChange)

    renderer.start()

    return () => {
      renderer.stop()
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setState(state)
  }, [state])

  useEffect(() => {
    rendererRef.current?.setAudioLevel(audioLevel)
  }, [audioLevel])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ touchAction: 'none' }}
    />
  )
}
