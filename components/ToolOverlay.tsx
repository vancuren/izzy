'use client'

import { useEffect, useState } from 'react'
import type { ToolActivity, BuilderStatus } from '@/lib/agent/use-agent'
import { WebSearchOverlay } from './tool-overlays/WebSearchOverlay'
import { BrowserOverlay } from './tool-overlays/BrowserOverlay'
import { DeepMemoryOverlay } from './tool-overlays/DeepMemoryOverlay'
import { ReasonOverlay } from './tool-overlays/ReasonOverlay'
import { BuilderOverlay } from './tool-overlays/BuilderOverlay'

interface Props {
  toolActivity: ToolActivity
  builderStatus: BuilderStatus | null
}

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Web Search',
  browser_use: 'Browser',
  deep_memory: 'Deep Memory',
  reason: 'Reasoning',
  request_capability: 'Building',
}

const TOOL_ACCENT_VAR: Record<string, string> = {
  web_search: 'var(--accent-cyan)',
  browser_use: 'var(--accent-blue)',
  deep_memory: 'var(--accent-violet)',
  reason: 'var(--accent-yellow)',
  request_capability: 'var(--accent-blue)',
}

export function ToolOverlay({ toolActivity, builderStatus }: Props) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const activeTool = toolActivity.activeTool
  const hasEvents = toolActivity.events.length > 0
  const showBuilder = builderStatus !== null && !activeTool
  const showTool = activeTool || (hasEvents && !dismissed)

  useEffect(() => {
    if (showTool || showBuilder) {
      setVisible(true)
      setDismissed(false)
    } else {
      const timer = setTimeout(() => setVisible(false), 200)
      return () => clearTimeout(timer)
    }
  }, [showTool, showBuilder])

  useEffect(() => {
    if (activeTool) {
      setDismissed(false)
    }
  }, [activeTool])

  if (!visible) return null

  const currentTool = activeTool ?? (hasEvents ? toolActivity.events[0].name : null)
  const toolName = showBuilder ? 'request_capability' : currentTool
  const label = toolName ? TOOL_LABELS[toolName] ?? toolName : ''
  const accentColor = toolName ? TOOL_ACCENT_VAR[toolName] ?? 'var(--text-muted)' : 'var(--text-muted)'
  const isActive = showTool || showBuilder

  return (
    <div
      className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20
        w-full max-w-md mx-4 transition-all ease-out
        ${isActive ? 'opacity-100 scale-100 duration-300' : 'opacity-0 scale-[0.97] pointer-events-none duration-200'}`}
    >
      <div
        className="backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border"
        style={{
          background: 'var(--bg-panel)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2 h-2 rounded-full ${isActive && activeTool ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: accentColor }}
            />
            <span
              className="text-sm font-mono"
              style={{ color: 'var(--text-secondary)' }}
            >
              {label}
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Close tool overlay"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-200
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet)]"
            style={{ color: 'var(--text-faint)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-faint)'
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {showBuilder && builderStatus ? (
            <BuilderOverlay status={builderStatus} />
          ) : currentTool === 'web_search' ? (
            <WebSearchOverlay events={toolActivity.events} />
          ) : currentTool === 'browser_use' ? (
            <BrowserOverlay events={toolActivity.events} />
          ) : currentTool === 'deep_memory' ? (
            <DeepMemoryOverlay events={toolActivity.events} />
          ) : currentTool === 'reason' ? (
            <ReasonOverlay events={toolActivity.events} />
          ) : (
            <div
              className="text-xs font-mono animate-pulse"
              style={{ color: 'var(--text-muted)' }}
            >
              Processing...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
