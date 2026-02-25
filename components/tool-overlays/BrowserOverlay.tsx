'use client'

import type { ToolEvent } from '@/lib/tools/stream-types'

interface Props {
  events: ToolEvent[]
}

export function BrowserOverlay({ events }: Props) {
  const progressEvents = events.filter(
    (e) => e.name === 'browser_use' && e.type === 'tool_progress',
  )
  const resultEvent = events.find(
    (e) => e.name === 'browser_use' && e.type === 'tool_result',
  )

  const loadingEvent = progressEvents.find(
    (e) => e.type === 'tool_progress' && e.data.status === 'loading',
  )
  const readingEvent = progressEvents.find(
    (e) => e.type === 'tool_progress' && e.data.status === 'reading',
  )

  const url = loadingEvent?.type === 'tool_progress' ? (loadingEvent.data.url as string) : ''
  const title = readingEvent?.type === 'tool_progress' ? (readingEvent.data.title as string) : ''

  let content = ''
  let excerpt = ''
  if (resultEvent?.type === 'tool_result' && !resultEvent.isError) {
    try {
      const parsed = JSON.parse(resultEvent.result)
      content = parsed.content ?? ''
      excerpt = parsed.excerpt ?? ''
    } catch {
      // ignore
    }
  }

  const isLoading = !readingEvent && !resultEvent

  return (
    <div className="space-y-3">
      {/* Faux browser chrome */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          background: 'var(--bg-subtle)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ff5f57', opacity: 0.6 }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#febc2e', opacity: 0.6 }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#28c840', opacity: 0.6 }} />
          </div>
          {/* URL bar */}
          <div
            className="flex-1 px-2.5 py-1 rounded-lg text-[11px] truncate font-mono tracking-wide"
            style={{
              background: 'var(--bg-hover)',
              color: 'var(--text-muted)',
            }}
          >
            {url || '...'}
          </div>
        </div>

        {/* Loading bar */}
        {isLoading && (
          <div className="h-0.5 overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
            <div className="h-full w-1/3 animate-loading-bar" style={{ backgroundColor: 'var(--accent-blue)', opacity: 0.6 }} />
          </div>
        )}

        {/* Content area */}
        <div className="p-3.5 max-h-[40vh] overflow-y-auto">
          {title && (
            <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
          )}
          {excerpt && !content && (
            <p className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>
              {excerpt}
            </p>
          )}
          {content && (
            <p
              className="text-xs leading-relaxed whitespace-pre-wrap line-clamp-[20]"
              style={{ color: 'var(--text-secondary)' }}
            >
              {content.slice(0, 1500)}
            </p>
          )}
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <span className="text-xs animate-pulse" style={{ color: 'var(--text-faint)' }}>
                Loading page...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
