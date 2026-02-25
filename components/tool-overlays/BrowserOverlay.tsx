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

  // Parse content from result
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
      <div className="rounded-lg bg-white/5 border border-white/10 overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-white/20" />
            <div className="w-2 h-2 rounded-full bg-white/20" />
            <div className="w-2 h-2 rounded-full bg-white/20" />
          </div>
          {/* URL bar */}
          <div className="flex-1 px-2 py-1 rounded bg-white/5 text-xs text-white/40 truncate font-mono">
            {url || '...'}
          </div>
        </div>

        {/* Loading bar */}
        {isLoading && (
          <div className="h-0.5 bg-white/5 overflow-hidden">
            <div className="h-full w-1/3 bg-blue-400/60 animate-loading-bar" />
          </div>
        )}

        {/* Content area */}
        <div className="p-3 max-h-[40vh] overflow-y-auto">
          {title && (
            <h3 className="text-sm font-medium text-white/90 mb-2">{title}</h3>
          )}
          {excerpt && !content && (
            <p className="text-xs text-white/50 italic">{excerpt}</p>
          )}
          {content && (
            <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap line-clamp-[20]">
              {content.slice(0, 1500)}
            </p>
          )}
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <span className="text-xs text-white/30 animate-pulse">Loading page...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
