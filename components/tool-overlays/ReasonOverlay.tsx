'use client'

import type { ToolEvent } from '@/lib/tools/stream-types'

interface Props {
  events: ToolEvent[]
}

export function ReasonOverlay({ events }: Props) {
  const progressEvents = events.filter(
    (e) => e.name === 'reason' && e.type === 'tool_progress',
  )

  const thinkingEvent = progressEvents.find(
    (e) => e.type === 'tool_progress' && e.data.status === 'thinking',
  )
  const stepEvents = progressEvents.filter(
    (e) => e.type === 'tool_progress' && e.data.status === 'step',
  )
  const conclusionEvent = progressEvents.find(
    (e) => e.type === 'tool_progress' && e.data.status === 'conclusion',
  )

  const question = thinkingEvent?.type === 'tool_progress' ? (thinkingEvent.data.question as string) : ''
  const isThinking = !conclusionEvent && stepEvents.length === 0

  return (
    <div className="space-y-3">
      {/* Question */}
      {question && (
        <div className="text-xs text-white/40 font-mono truncate">
          &ldquo;{question}&rdquo;
        </div>
      )}

      {/* Thinking indicator */}
      {isThinking && (
        <div className="flex items-center gap-2 py-3">
          <div className="w-4 h-4 border-2 border-yellow-400/30 border-t-yellow-400/80 rounded-full animate-spin" />
          <span className="text-xs text-white/40 animate-pulse">Reasoning...</span>
        </div>
      )}

      {/* Steps */}
      {stepEvents.length > 0 && (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          {stepEvents.map((e, i) => {
            if (e.type !== 'tool_progress') return null
            const stepNum = e.data.step as number
            const text = e.data.text as string
            return (
              <div
                key={i}
                className="flex gap-2 animate-in fade-in slide-in-from-left-2"
                style={{ animationDelay: `${i * 120}ms`, animationFillMode: 'both' }}
              >
                <span className="text-xs text-yellow-400/60 font-mono shrink-0 mt-0.5">
                  {stepNum}.
                </span>
                <p className="text-xs text-white/60 leading-relaxed">{text}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Conclusion */}
      {conclusionEvent?.type === 'tool_progress' && (
        <div className="px-3 py-2 rounded-lg bg-yellow-500/5 border border-yellow-400/10 animate-in fade-in">
          <p className="text-xs text-yellow-200/70 font-medium mb-1">Conclusion</p>
          <p className="text-xs text-white/70 leading-relaxed">
            {conclusionEvent.data.text as string}
          </p>
        </div>
      )}
    </div>
  )
}
