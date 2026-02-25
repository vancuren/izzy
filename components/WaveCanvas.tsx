'use client'

import { useEffect, useRef } from 'react'
import { WaveRenderer } from '@/lib/canvas/wave-renderer'
import { DARK_CONFIG, LIGHT_CONFIG } from '@/lib/canvas/types'
import { useTheme } from './ThemeProvider'

interface WaveCanvasProps {
  state: string
  audioLevel: number
}

export function WaveCanvas({ state, audioLevel }: WaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<WaveRenderer | null>(null)
  const { theme } = useTheme()

  useEffect(() => {
    if (!canvasRef.current) return
    const renderer = new WaveRenderer(canvasRef.current)
    rendererRef.current = renderer
    // Config is set by the [theme] effect below
    renderer.start()

    return () => {
      renderer.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // React to theme changes
  useEffect(() => {
    rendererRef.current?.setConfig(theme === 'dark' ? DARK_CONFIG : LIGHT_CONFIG)
  }, [theme])

  useEffect(() => {
    rendererRef.current?.setState(state as import('@/lib/canvas/types').AgentState)
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
