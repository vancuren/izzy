'use client'

import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      className="fixed top-6 right-6 z-30 w-10 h-10 flex items-center justify-center
        rounded-full backdrop-blur-md border transition-all duration-300
        hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-violet)] focus-visible:ring-offset-2
        focus-visible:ring-offset-[var(--bg)]"
      style={{
        background: 'var(--bg-panel)',
        borderColor: 'var(--border)',
      }}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <div className="relative w-5 h-5">
        {/* Sun icon */}
        <svg
          className="absolute inset-0 w-5 h-5 transition-all duration-500"
          style={{
            color: 'var(--text-secondary)',
            opacity: theme === 'light' ? 1 : 0,
            transform: theme === 'light' ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)',
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
        </svg>
        {/* Moon icon */}
        <svg
          className="absolute inset-0 w-5 h-5 transition-all duration-500"
          style={{
            color: 'var(--text-secondary)',
            opacity: theme === 'dark' ? 1 : 0,
            transform: theme === 'dark' ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.5)',
          }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </div>
    </button>
  )
}
