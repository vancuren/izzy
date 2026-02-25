'use client'

import type { ToolEvent } from '@/lib/tools/stream-types'

interface Props {
  events: ToolEvent[]
}

export function DeepMemoryOverlay({ events }: Props) {
  const progressEvents = events.filter(
    (e) => e.name === 'deep_memory' && e.type === 'tool_progress',
  )
  const resultEvent = events.find(
    (e) => e.name === 'deep_memory' && e.type === 'tool_result',
  )

  const expandingEvent = progressEvents.find(
    (e) => e.type === 'tool_progress' && e.data.status === 'expanding',
  )
  const searchingEvent = progressEvents.find(
    (e) => e.type === 'tool_progress' && e.data.status === 'searching',
  )
  const foundEvent = progressEvents.find(
    (e) => e.type === 'tool_progress' && e.data.status === 'found',
  )

  const query = expandingEvent?.type === 'tool_progress' ? (expandingEvent.data.query as string) : ''
  const memories =
    foundEvent?.type === 'tool_progress'
      ? (foundEvent.data.memories as Array<{ content: string; tags: string[]; tier: string }>)
      : []
  const count = foundEvent?.type === 'tool_progress' ? (foundEvent.data.count as number) : 0

  let synthesis = ''
  if (resultEvent?.type === 'tool_result' && !resultEvent.isError) {
    try {
      const parsed = JSON.parse(resultEvent.result)
      synthesis = parsed.synthesis ?? ''
    } catch {
      // ignore
    }
  }

  const isSearching = !foundEvent && !resultEvent

  return (
    <div className="space-y-3">
      {/* Query */}
      {query && (
        <div className="text-xs font-mono tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Searching: &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Search angles */}
      {searchingEvent?.type === 'tool_progress' && isSearching && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-faint)' }}>
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ backgroundColor: 'var(--accent-violet)', opacity: 0.6, animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ backgroundColor: 'var(--accent-violet)', opacity: 0.6, animationDelay: '200ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ backgroundColor: 'var(--accent-violet)', opacity: 0.6, animationDelay: '400ms' }} />
          </div>
          <span className="animate-pulse">Searching memories...</span>
        </div>
      )}

      {/* Memory cards */}
      {memories && memories.length > 0 && (
        <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
          {memories.slice(0, 6).map((m, i) => (
            <div
              key={i}
              className="px-3.5 py-2.5 rounded-xl border animate-in fade-in slide-in-from-bottom-2"
              style={{
                animationDelay: `${i * 80}ms`,
                animationFillMode: 'both',
                background: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {m.content}
              </p>
              {m.tags && m.tags.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {m.tags.slice(0, 4).map((tag, j) => (
                    <span
                      key={j}
                      className="px-1.5 py-0.5 rounded-md text-[10px] tracking-wide"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent-violet) 10%, transparent)',
                        color: 'var(--accent-violet)',
                        opacity: 0.7,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Count badge */}
      {count > 0 && (
        <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
          Found {count} relevant {count === 1 ? 'memory' : 'memories'}
        </div>
      )}

      {/* Synthesis */}
      {synthesis && (
        <div
          className="px-3.5 py-2.5 rounded-xl border"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent-violet) 5%, transparent)',
            borderColor: 'color-mix(in srgb, var(--accent-violet) 10%, transparent)',
          }}
        >
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {synthesis}
          </p>
        </div>
      )}
    </div>
  )
}
