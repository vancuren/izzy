'use client'

import { WaveCanvas } from '@/components/WaveCanvas'
import { ToolOverlay } from '@/components/ToolOverlay'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAgent } from '@/lib/agent/use-agent'

export default function Home() {
  const { state, audioLevel, messages, builderStatus, toolActivity } = useAgent()
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <WaveCanvas state={state} audioLevel={audioLevel} />
      <div className="vignette" />

      <ThemeToggle />

      {/* Last message display */}
      {lastMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-10 max-w-lg text-center">
          <p
            className="text-xs font-mono mb-1 tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            {lastMessage.role === 'user' ? 'you' : 'izzy'}
          </p>
          <p
            className="text-base leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {lastMessage.content}
          </p>
        </div>
      )}

      {/* Tool activity overlay */}
      <ToolOverlay toolActivity={toolActivity} builderStatus={builderStatus} />

      {/* State indicator */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div
          className="flex items-center gap-2.5 px-5 py-2.5 rounded-full backdrop-blur-md border transition-colors duration-300"
          style={{
            background: 'var(--bg-panel)',
            borderColor: 'var(--border)',
          }}
        >
          <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${
            state === 'idle' ? 'opacity-40' :
            state === 'listening' ? 'animate-pulse' :
            state === 'thinking' ? 'animate-pulse' :
            state === 'speaking' ? 'animate-pulse' :
            'opacity-40'
          }`}
          style={{
            backgroundColor: state === 'idle' ? 'var(--text-muted)' :
              state === 'listening' ? 'var(--accent-green)' :
              state === 'thinking' ? 'var(--accent-yellow)' :
              state === 'speaking' ? 'var(--accent-violet)' :
              'var(--text-muted)',
          }}
          />
          <span
            className="text-xs font-mono uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            {state}
          </span>
        </div>
      </div>
    </main>
  )
}
