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

  // Parse synthesis from result
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
        <div className="text-xs text-white/40 font-mono">
          Searching: &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Search angles */}
      {searchingEvent?.type === 'tool_progress' && isSearching && (
        <div className="flex items-center gap-2 text-xs text-white/30">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
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
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/5 animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
            >
              <p className="text-xs text-white/70">{m.content}</p>
              {m.tags && m.tags.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {m.tags.slice(0, 4).map((tag, j) => (
                    <span
                      key={j}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/10 text-violet-300/60"
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
        <div className="text-xs text-white/30">
          Found {count} relevant {count === 1 ? 'memory' : 'memories'}
        </div>
      )}

      {/* Synthesis */}
      {synthesis && (
        <div className="px-3 py-2 rounded-lg bg-violet-500/5 border border-violet-400/10">
          <p className="text-xs text-white/60 leading-relaxed">{synthesis}</p>
        </div>
      )}
    </div>
  )
}
