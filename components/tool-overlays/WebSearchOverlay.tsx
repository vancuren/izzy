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
      <div
        className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border"
        style={{
          background: 'var(--bg-subtle)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <svg
          className="w-4 h-4 shrink-0"
          style={{ color: 'var(--text-muted)' }}
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
        <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
          {query || '...'}
        </span>
        {!resultsReady && !resultEvent && (
          <span
            className="ml-auto text-xs animate-pulse tracking-wide"
            style={{ color: 'var(--text-faint)' }}
          >
            searching...
          </span>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          {results.slice(0, 5).map((r, i) => (
            <div
              key={i}
              className="px-3.5 py-2.5 rounded-xl border animate-in fade-in slide-in-from-bottom-2"
              style={{
                animationDelay: `${i * 100}ms`,
                animationFillMode: 'both',
                background: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {r.title}
              </p>
              <p
                className="text-xs mt-1 line-clamp-2 leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {r.snippet}
              </p>
              <p
                className="text-[11px] mt-1 truncate tracking-wide"
                style={{ color: 'var(--text-faint)' }}
              >
                {r.url}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Loading state */}
      {results.length === 0 && !resultEvent && (
        <div className="flex items-center justify-center py-4">
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ backgroundColor: 'var(--text-muted)', animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ backgroundColor: 'var(--text-muted)', animationDelay: '200ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ backgroundColor: 'var(--text-muted)', animationDelay: '400ms' }} />
          </div>
        </div>
      )}
    </div>
  )
}
