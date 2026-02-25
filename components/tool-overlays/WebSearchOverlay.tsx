'use client'

import type { ToolEvent } from '@/lib/tools/stream-types'

interface Props {
  events: ToolEvent[]
}

export function WebSearchOverlay({ events }: Props) {
  const progressEvents = events.filter(
    (e) => e.name === 'web_search' && e.type === 'tool_progress',
  )
  const resultEvent = events.find(
    (e) => e.name === 'web_search' && e.type === 'tool_result',
  )

  const searchingEvent = progressEvents.find(
    (e) => e.type === 'tool_progress' && e.data.status === 'searching',
  )
  const query =
    searchingEvent?.type === 'tool_progress'
      ? (searchingEvent.data.query as string)
      : ''

  const resultsReady = progressEvents.find(
    (e) => e.type === 'tool_progress' && e.data.status === 'results',
  )

  // Parse results from tool_result
  let results: Array<{ title: string; url: string; snippet: string }> = []
  if (resultEvent?.type === 'tool_result' && !resultEvent.isError) {
    try {
      const parsed = JSON.parse(resultEvent.result)
      results = parsed.results ?? []
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
        <svg
          className="w-4 h-4 text-white/40 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="text-sm text-white/70 truncate">{query || '...'}</span>
        {!resultsReady && !resultEvent && (
          <span className="ml-auto text-xs text-white/30 animate-pulse">searching...</span>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          {results.slice(0, 5).map((r, i) => (
            <div
              key={i}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/5 animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
            >
              <p className="text-sm text-white/90 font-medium truncate">{r.title}</p>
              <p className="text-xs text-white/50 mt-1 line-clamp-2">{r.snippet}</p>
              <p className="text-xs text-white/20 mt-1 truncate">{r.url}</p>
            </div>
          ))}
        </div>
      )}

      {/* Loading state with no results yet */}
      {results.length === 0 && !resultEvent && (
        <div className="flex items-center justify-center py-4">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}
    </div>
  )
}
