'use client'

import { useState } from 'react'
import { WaveCanvas } from '@/components/WaveCanvas'
import { AgentState } from '@/lib/canvas/types'

export default function Home() {
  const [agentState, setAgentState] = useState<AgentState>('idle')
  const [audioLevel, setAudioLevel] = useState(0)

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <WaveCanvas state={agentState} audioLevel={audioLevel} />
    </main>
  )
}
