'use client'

import type { BuilderStatus } from '@/lib/agent/use-agent'

interface Props {
  status: BuilderStatus
}

export function BuilderOverlay({ status }: Props) {
  return (
    <div className="space-y-3">
      {/* Status indicator */}
      <div className="flex items-center gap-2.5">
        {status.state === 'building' && (
          <div
            className="w-4 h-4 border-2 rounded-full animate-spin"
            style={{
              borderColor: 'color-mix(in srgb, var(--accent-blue) 30%, transparent)',
              borderTopColor: 'color-mix(in srgb, var(--accent-blue) 80%, transparent)',
            }}
          />
        )}
        {status.state === 'complete' && (
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-green)', opacity: 0.8 }}
          >
            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {status.state === 'error' && (
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-red)', opacity: 0.8 }}
          >
            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {status.state === 'building' && 'Building capability...'}
          {status.state === 'complete' && `Built: ${status.capabilityName}`}
          {status.state === 'error' && 'Build failed'}
        </span>
      </div>

      {/* Progress detail */}
      {status.state === 'building' && (
        <div className="space-y-2">
          {status.step && (
            <div
              className="px-3.5 py-2.5 rounded-xl border"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-blue) 5%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)',
              }}
            >
              <p className="text-xs font-medium" style={{ color: 'var(--accent-blue)', opacity: 0.7 }}>
                {status.step}
              </p>
              {status.detail && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {status.detail}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error detail */}
      {status.state === 'error' && status.error && (
        <div
          className="px-3.5 py-2.5 rounded-xl border"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent-red) 5%, transparent)',
            borderColor: 'color-mix(in srgb, var(--accent-red) 10%, transparent)',
          }}
        >
          <p className="text-xs" style={{ color: 'var(--accent-red)', opacity: 0.6 }}>
            {status.error}
          </p>
        </div>
      )}

      {/* Success detail */}
      {status.state === 'complete' && (
        <div
          className="px-3.5 py-2.5 rounded-xl border"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent-green) 5%, transparent)',
            borderColor: 'color-mix(in srgb, var(--accent-green) 10%, transparent)',
          }}
        >
          <p className="text-xs" style={{ color: 'var(--accent-green)', opacity: 0.6 }}>
            Capability &ldquo;{status.capabilityName}&rdquo; is now available.
          </p>
        </div>
      )}
    </div>
  )
}
