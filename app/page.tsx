'use client'

import { WaveCanvas } from '@/components/WaveCanvas'
import { useAgent } from '@/lib/agent/use-agent'

export default function Home() {
  const { state, audioLevel, messages } = useAgent()

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <WaveCanvas state={state} audioLevel={audioLevel} />

      {/* Subtle state indicator */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10">
          <div className={`w-2 h-2 rounded-full ${
            state === 'idle' ? 'bg-white/40' :
            state === 'listening' ? 'bg-green-400 animate-pulse' :
            state === 'thinking' ? 'bg-yellow-400 animate-pulse' :
            state === 'speaking' ? 'bg-violet-400 animate-pulse' :
            'bg-white/40'
          }`} />
          <span className="text-xs text-white/60 font-mono uppercase tracking-wider">
            {state}
          </span>
        </div>
      </div>
    </main>
  )
}
