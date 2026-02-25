'use client'

import type { BuilderStatus } from '@/lib/agent/use-agent'

interface Props {
  status: BuilderStatus
}

export function BuilderOverlay({ status }: Props) {
  return (
    <div className="space-y-3">
      {/* Status indicator */}
      <div className="flex items-center gap-2">
        {status.state === 'building' && (
          <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400/80 rounded-full animate-spin" />
        )}
        {status.state === 'complete' && (
          <div className="w-4 h-4 rounded-full bg-green-400/80 flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {status.state === 'error' && (
          <div className="w-4 h-4 rounded-full bg-red-400/80 flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
        <span className="text-sm text-white/70">
          {status.state === 'building' && 'Building capability...'}
          {status.state === 'complete' && `Built: ${status.capabilityName}`}
          {status.state === 'error' && 'Build failed'}
        </span>
      </div>

      {/* Progress detail */}
      {status.state === 'building' && (
        <div className="space-y-2">
          {status.step && (
            <div className="px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-400/10">
              <p className="text-xs text-blue-300/70 font-medium">{status.step}</p>
              {status.detail && (
                <p className="text-xs text-white/40 mt-1">{status.detail}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error detail */}
      {status.state === 'error' && status.error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/5 border border-red-400/10">
          <p className="text-xs text-red-300/60">{status.error}</p>
        </div>
      )}

      {/* Success detail */}
      {status.state === 'complete' && (
        <div className="px-3 py-2 rounded-lg bg-green-500/5 border border-green-400/10">
          <p className="text-xs text-green-300/60">
            Capability &ldquo;{status.capabilityName}&rdquo; is now available.
          </p>
        </div>
      )}
    </div>
  )
}
