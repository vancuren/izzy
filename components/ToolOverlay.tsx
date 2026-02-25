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

const TOOL_COLORS: Record<string, string> = {
  web_search: 'bg-cyan-400',
  browser_use: 'bg-blue-400',
  deep_memory: 'bg-violet-400',
  reason: 'bg-yellow-400',
  request_capability: 'bg-blue-400',
}

export function ToolOverlay({ toolActivity, builderStatus }: Props) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Determine which tool to show
  const activeTool = toolActivity.activeTool
  const hasEvents = toolActivity.events.length > 0
  const showBuilder = builderStatus !== null && !activeTool
  const showTool = activeTool || (hasEvents && !dismissed)

  useEffect(() => {
    if (showTool || showBuilder) {
      setVisible(true)
      setDismissed(false)
    } else {
      // Delay hide for exit animation
      const timer = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(timer)
    }
  }, [showTool, showBuilder])

  // Reset dismissed state when new events come in
  useEffect(() => {
    if (activeTool) {
      setDismissed(false)
    }
  }, [activeTool])

  if (!visible) return null

  const currentTool = activeTool ?? (hasEvents ? toolActivity.events[0].name : null)
  const toolName = showBuilder ? 'request_capability' : currentTool
  const label = toolName ? TOOL_LABELS[toolName] ?? toolName : ''
  const dotColor = toolName ? TOOL_COLORS[toolName] ?? 'bg-white/40' : 'bg-white/40'
  const isActive = showTool || showBuilder

  return (
    <div
      className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20
        w-full max-w-md mx-4 transition-all duration-300 ease-out
        ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
    >
      <div className="backdrop-blur-xl bg-black/30 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${dotColor} ${isActive && activeTool ? 'animate-pulse' : ''}`} />
            <span className="text-sm text-white/70 font-mono">{label}</span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-white/20 hover:text-white/50 transition-colors"
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
            <div className="text-xs text-white/40 font-mono animate-pulse">
              Processing...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
