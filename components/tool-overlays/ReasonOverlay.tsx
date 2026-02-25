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
        <div
          className="text-xs font-mono truncate tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          &ldquo;{question}&rdquo;
        </div>
      )}

      {/* Thinking indicator */}
      {isThinking && (
        <div className="flex items-center gap-2 py-3">
          <div
            className="w-4 h-4 border-2 rounded-full animate-spin"
            style={{
              borderColor: 'color-mix(in srgb, var(--accent-yellow) 30%, transparent)',
              borderTopColor: 'color-mix(in srgb, var(--accent-yellow) 80%, transparent)',
            }}
          />
          <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>
            Reasoning...
          </span>
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
                <span
                  className="text-xs font-mono shrink-0 mt-0.5"
                  style={{ color: 'var(--accent-yellow)', opacity: 0.6 }}
                >
                  {stepNum}.
                </span>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {text}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Conclusion */}
      {conclusionEvent?.type === 'tool_progress' && (
        <div
          className="px-3.5 py-2.5 rounded-xl border animate-in fade-in"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent-yellow) 5%, transparent)',
            borderColor: 'color-mix(in srgb, var(--accent-yellow) 10%, transparent)',
          }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--accent-yellow)', opacity: 0.7 }}>
            Conclusion
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {conclusionEvent.data.text as string}
          </p>
        </div>
      )}
    </div>
  )
}
