# IzzyClaude Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js voice agent with abstract wavy-line visualization, always-on mic, Claude-powered responses, and a tiered memory store.

**Architecture:** Monolithic Next.js 15 (App Router). Canvas 2D for visualization. Web Speech API for I/O. Claude API via `@anthropic-ai/sdk`. SQLite via `better-sqlite3` for memory persistence.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, HTML Canvas 2D, Web Speech API, Web Audio API, `@anthropic-ai/sdk`, `better-sqlite3`, `uuid`

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local`, `.gitignore`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Step 1: Initialize project**

```bash
cd /Users/russellvancuren/Projects/IzzyClaude
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```

If directory not empty, answer yes to overwrite.

**Step 2: Install dependencies**

```bash
npm install @anthropic-ai/sdk better-sqlite3 uuid
npm install --save-dev @types/better-sqlite3 @types/uuid
```

**Step 3: Configure next.config.ts**

Replace `next.config.ts` with:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
```

**Step 4: Create .env.local**

```
ANTHROPIC_API_KEY=your-key-here
IDLE_TIMEOUT_MS=300000
DB_PATH=data/izzy.db
```

**Step 5: Create data directory**

```bash
mkdir -p data
echo "data/*.db" >> .gitignore
```

**Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Server running on localhost:3000

**Step 7: Init git and commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Next.js 15 project with dependencies"
```

---

### Task 2: Canvas Wave Renderer — Idle State

**Files:**
- Create: `lib/canvas/wave-renderer.ts`
- Create: `lib/canvas/types.ts`
- Create: `components/WaveCanvas.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Step 1: Create canvas types**

Create `lib/canvas/types.ts`:

```ts
export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'prompting'

export interface WaveConfig {
  lineCount: number
  baseAmplitude: number
  baseFrequency: number
  baseSpeed: number
  colors: {
    start: string
    mid: string
    end: string
  }
  backgroundColor: string
}

export const DARK_CONFIG: WaveConfig = {
  lineCount: 30,
  baseAmplitude: 40,
  baseFrequency: 0.008,
  baseSpeed: 0.015,
  colors: {
    start: '#ff2d78',
    mid: '#7b2ff7',
    end: '#2d5bff',
  },
  backgroundColor: '#0a0a1a',
}

export const LIGHT_CONFIG: WaveConfig = {
  lineCount: 30,
  baseAmplitude: 40,
  baseFrequency: 0.008,
  baseSpeed: 0.015,
  colors: {
    start: '#c41e5c',
    mid: '#5a1fb8',
    end: '#1e3fcc',
  },
  backgroundColor: '#f8f6ff',
}
```

**Step 2: Create wave renderer**

Create `lib/canvas/wave-renderer.ts`:

```ts
import { AgentState, WaveConfig, DARK_CONFIG } from './types'

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}

export class WaveRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private config: WaveConfig
  private time = 0
  private animationId = 0
  private audioLevel = 0
  private state: AgentState = 'idle'
  private faceTransition = 0 // 0 = waves, 1 = face

  constructor(canvas: HTMLCanvasElement, config?: WaveConfig) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.config = config ?? DARK_CONFIG
  }

  setConfig(config: WaveConfig) {
    this.config = config
  }

  setState(state: AgentState) {
    this.state = state
  }

  setAudioLevel(level: number) {
    this.audioLevel = Math.min(1, Math.max(0, level))
  }

  start() {
    const loop = () => {
      this.render()
      this.animationId = requestAnimationFrame(loop)
    }
    loop()
  }

  stop() {
    cancelAnimationFrame(this.animationId)
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.ctx.scale(dpr, dpr)
  }

  private render() {
    const rect = this.canvas.getBoundingClientRect()
    if (this.canvas.width !== rect.width * (window.devicePixelRatio || 1)) {
      this.resize()
    }

    const w = rect.width
    const h = rect.height
    const { lineCount, baseAmplitude, baseFrequency, baseSpeed, colors, backgroundColor } = this.config

    // Update time
    const speedMultiplier = this.state === 'listening' ? 1.5 + this.audioLevel * 2 :
                            this.state === 'thinking' ? 2.5 :
                            this.state === 'speaking' ? 1.2 :
                            1.0
    this.time += baseSpeed * speedMultiplier

    // Transition face morph
    const targetFace = this.state === 'speaking' ? 1 : 0
    this.faceTransition += (targetFace - this.faceTransition) * 0.03

    // Clear
    this.ctx.fillStyle = backgroundColor
    this.ctx.fillRect(0, 0, w, h)

    // Parse colors
    const startRgb = hexToRgb(colors.start)
    const midRgb = hexToRgb(colors.mid)
    const endRgb = hexToRgb(colors.end)

    // Draw lines
    for (let i = 0; i < lineCount; i++) {
      const t = i / (lineCount - 1)
      const color = t < 0.5
        ? lerpColor(startRgb, midRgb, t * 2)
        : lerpColor(midRgb, endRgb, (t - 0.5) * 2)

      this.ctx.strokeStyle = color
      this.ctx.lineWidth = 1.5
      this.ctx.globalAlpha = 0.6 + t * 0.4
      this.ctx.beginPath()

      const yBase = h * 0.3 + (h * 0.5) * t
      const amplitudeMultiplier =
        this.state === 'listening' ? 1.0 + this.audioLevel * 1.5 :
        this.state === 'thinking' ? 0.5 + Math.sin(this.time * 3 + i * 0.5) * 0.3 :
        this.state === 'speaking' ? 0.8 + this.audioLevel * 0.5 :
        1.0

      for (let x = 0; x <= w; x += 2) {
        const xNorm = x / w

        // Wave calculation
        let y = yBase
        const wave1 = Math.sin(x * baseFrequency + this.time + i * 0.3) * baseAmplitude * amplitudeMultiplier
        const wave2 = Math.sin(x * baseFrequency * 0.5 + this.time * 0.7 + i * 0.5) * baseAmplitude * 0.5 * amplitudeMultiplier
        const waveY = y + wave1 + wave2

        // Face morph offset
        let faceOffset = 0
        if (this.faceTransition > 0.01) {
          const cx = w * 0.5
          const cy = h * 0.45
          const dx = (x - cx) / (w * 0.3)
          const dy = (yBase - cy) / (h * 0.3)
          const dist = Math.sqrt(dx * dx + dy * dy)

          // Left eye void
          const leftEyeX = -0.35
          const leftEyeY = -0.15
          const leftDist = Math.sqrt((dx - leftEyeX) ** 2 + (dy - leftEyeY) ** 2)
          if (leftDist < 0.25) {
            faceOffset -= (0.25 - leftDist) * 80 * this.faceTransition
          }

          // Right eye void
          const rightEyeX = 0.35
          const rightEyeY = -0.15
          const rightDist = Math.sqrt((dx - rightEyeX) ** 2 + (dy - rightEyeY) ** 2)
          if (rightDist < 0.25) {
            faceOffset -= (0.25 - rightDist) * 80 * this.faceTransition
          }

          // Jaw/mouth
          const mouthY = 0.35 + this.audioLevel * 0.15
          const mouthDist = Math.sqrt(dx * dx + (dy - mouthY) ** 2)
          if (mouthDist < 0.2) {
            const openAmount = this.state === 'speaking' ? this.audioLevel * 0.8 + 0.2 : 0.1
            faceOffset += (0.2 - mouthDist) * 60 * openAmount * this.faceTransition
          }

          // Overall face contour pull
          if (dist < 1.2) {
            const pull = (1.2 - dist) * 15 * this.faceTransition
            faceOffset += (dy < 0 ? -pull : pull) * 0.3
          }
        }

        y = waveY + faceOffset

        if (x === 0) {
          this.ctx.moveTo(x, y)
        } else {
          this.ctx.lineTo(x, y)
        }
      }

      this.ctx.stroke()
    }

    this.ctx.globalAlpha = 1
  }
}
```

**Step 3: Create WaveCanvas component**

Create `components/WaveCanvas.tsx`:

```tsx
'use client'

import { useEffect, useRef, useCallback } from 'react'
import { WaveRenderer } from '@/lib/canvas/wave-renderer'
import { AgentState, DARK_CONFIG, LIGHT_CONFIG } from '@/lib/canvas/types'

interface WaveCanvasProps {
  state: AgentState
  audioLevel: number
}

export function WaveCanvas({ state, audioLevel }: WaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<WaveRenderer | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const renderer = new WaveRenderer(canvasRef.current)
    rendererRef.current = renderer

    // Check theme
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    renderer.setConfig(isDark ? DARK_CONFIG : LIGHT_CONFIG)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      renderer.setConfig(e.matches ? DARK_CONFIG : LIGHT_CONFIG)
    }
    mediaQuery.addEventListener('change', handleChange)

    renderer.start()

    return () => {
      renderer.stop()
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setState(state)
  }, [state])

  useEffect(() => {
    rendererRef.current?.setAudioLevel(audioLevel)
  }, [audioLevel])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ touchAction: 'none' }}
    />
  )
}
```

**Step 4: Update page.tsx**

Replace `app/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { WaveCanvas } from '@/components/WaveCanvas'
import { AgentState } from '@/lib/canvas/types'

export default function Home() {
  const [agentState, setAgentState] = useState<AgentState>('idle')
  const [audioLevel, setAudioLevel] = useState(0)

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <WaveCanvas state={agentState} audioLevel={audioLevel} />
    </main>
  )
}
```

**Step 5: Update globals.css**

Replace `app/globals.css`:

```css
@import "tailwindcss";

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

@media (prefers-color-scheme: dark) {
  body {
    background: #0a0a1a;
  }
}

@media (prefers-color-scheme: light) {
  body {
    background: #f8f6ff;
  }
}
```

**Step 6: Update layout.tsx**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Izzy',
  description: 'Always-on AI voice companion',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}
```

**Step 7: Test visually**

```bash
npm run dev
```

Open localhost:3000. Should see flowing magenta-to-blue wavy lines on dark background.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: canvas wave renderer with idle animation"
```

---

### Task 3: Agent State Machine & Speech I/O

**Files:**
- Create: `lib/agent/state-machine.ts`
- Create: `lib/agent/speech.ts`
- Create: `lib/agent/use-agent.ts`
- Modify: `app/page.tsx`

**Step 1: Create speech utilities**

Create `lib/agent/speech.ts`:

```ts
export function createSpeechRecognition(): SpeechRecognition | null {
  if (typeof window === 'undefined') return null
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) return null

  const recognition = new SpeechRecognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'en-US'
  return recognition
}

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    speechSynthesis.speak(utterance)
  })
}

export function createAudioAnalyser(): {
  analyser: AnalyserNode
  getLevel: () => number
  cleanup: () => void
} | null {
  if (typeof window === 'undefined') return null

  try {
    const audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
    })

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    return {
      analyser,
      getLevel: () => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        return sum / (dataArray.length * 255)
      },
      cleanup: () => {
        audioCtx.close()
      },
    }
  } catch {
    return null
  }
}
```

**Step 2: Create state machine**

Create `lib/agent/state-machine.ts`:

```ts
import { AgentState } from '@/lib/canvas/types'

export type AgentEvent =
  | { type: 'SPEECH_DETECTED' }
  | { type: 'TRANSCRIPT_FINAL'; text: string }
  | { type: 'RESPONSE_READY'; text: string }
  | { type: 'SPEECH_DONE' }
  | { type: 'IDLE_TIMEOUT' }
  | { type: 'PROMPT_READY'; text: string }

export interface AgentContext {
  state: AgentState
  transcript: string
  response: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export function transition(ctx: AgentContext, event: AgentEvent): AgentContext {
  switch (ctx.state) {
    case 'idle':
      if (event.type === 'SPEECH_DETECTED') {
        return { ...ctx, state: 'listening', transcript: '' }
      }
      if (event.type === 'IDLE_TIMEOUT') {
        return { ...ctx, state: 'thinking' }
      }
      break

    case 'listening':
      if (event.type === 'TRANSCRIPT_FINAL') {
        return {
          ...ctx,
          state: 'thinking',
          transcript: event.text,
          messages: [...ctx.messages, { role: 'user', content: event.text }],
        }
      }
      break

    case 'thinking':
      if (event.type === 'RESPONSE_READY') {
        return {
          ...ctx,
          state: 'speaking',
          response: event.text,
          messages: [...ctx.messages, { role: 'assistant', content: event.text }],
        }
      }
      if (event.type === 'PROMPT_READY') {
        return {
          ...ctx,
          state: 'speaking',
          response: event.text,
          messages: [...ctx.messages, { role: 'assistant', content: event.text }],
        }
      }
      break

    case 'speaking':
      if (event.type === 'SPEECH_DONE') {
        return { ...ctx, state: 'idle' }
      }
      break
  }

  return ctx
}

export function createInitialContext(): AgentContext {
  return {
    state: 'idle',
    transcript: '',
    response: '',
    messages: [],
  }
}
```

**Step 3: Create useAgent hook**

Create `lib/agent/use-agent.ts`:

```tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AgentContext, AgentEvent, transition, createInitialContext } from './state-machine'
import { createSpeechRecognition, speak, createAudioAnalyser } from './speech'
import { AgentState } from '@/lib/canvas/types'

const IDLE_TIMEOUT_MS = parseInt(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS ?? '300000', 10)

export function useAgent() {
  const [ctx, setCtx] = useState<AgentContext>(createInitialContext)
  const [audioLevel, setAudioLevel] = useState(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const analyserRef = useRef<ReturnType<typeof createAudioAnalyser>>(null)
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioFrameRef = useRef<number>(0)

  const dispatch = useCallback((event: AgentEvent) => {
    setCtx((prev) => transition(prev, event))
  }, [])

  // Audio level polling
  useEffect(() => {
    const poll = () => {
      if (analyserRef.current) {
        setAudioLevel(analyserRef.current.getLevel())
      }
      audioFrameRef.current = requestAnimationFrame(poll)
    }
    poll()
    return () => cancelAnimationFrame(audioFrameRef.current)
  }, [])

  // Initialize audio analyser
  useEffect(() => {
    analyserRef.current = createAudioAnalyser()
    return () => analyserRef.current?.cleanup()
  }, [])

  // Idle timer management
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      dispatch({ type: 'IDLE_TIMEOUT' })
    }, IDLE_TIMEOUT_MS)
  }, [dispatch])

  // Handle state side effects
  useEffect(() => {
    const handleStateChange = async () => {
      switch (ctx.state) {
        case 'idle':
          resetIdleTimer()
          // Start listening
          if (!recognitionRef.current) {
            recognitionRef.current = createSpeechRecognition()
          }
          try {
            recognitionRef.current?.start()
          } catch {
            // Already started
          }
          break

        case 'listening':
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
          break

        case 'thinking': {
          // Stop recognition while processing
          try {
            recognitionRef.current?.stop()
          } catch {
            // Not started
          }

          const isIdlePrompt = ctx.transcript === ''
          const body = {
            messages: ctx.messages,
            isIdlePrompt,
          }

          try {
            const res = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            const data = await res.json()
            dispatch({ type: 'RESPONSE_READY', text: data.response })
          } catch (err) {
            dispatch({ type: 'RESPONSE_READY', text: "I'm having trouble connecting right now. Give me a moment." })
          }
          break
        }

        case 'speaking':
          await speak(ctx.response)
          dispatch({ type: 'SPEECH_DONE' })
          break
      }
    }

    handleStateChange()
  }, [ctx.state])

  // Set up speech recognition handlers
  useEffect(() => {
    const recognition = createSpeechRecognition()
    if (!recognition) return

    recognitionRef.current = recognition

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1]
      if (last.isFinal) {
        dispatch({ type: 'TRANSCRIPT_FINAL', text: last[0].transcript.trim() })
      } else if (ctx.state === 'idle') {
        dispatch({ type: 'SPEECH_DETECTED' })
      }
    }

    recognition.onend = () => {
      // Auto-restart if in idle state
      if (ctx.state === 'idle') {
        try {
          recognition.start()
        } catch {
          // Already started
        }
      }
    }

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Speech recognition error:', event.error)
      }
    }

    try {
      recognition.start()
    } catch {
      // Already started
    }

    return () => {
      try {
        recognition.stop()
      } catch {
        // Not started
      }
    }
  }, [])

  return {
    state: ctx.state,
    audioLevel,
    messages: ctx.messages,
  }
}
```

**Step 4: Update page.tsx to use agent hook**

Replace `app/page.tsx`:

```tsx
'use client'

import { WaveCanvas } from '@/components/WaveCanvas'
import { useAgent } from '@/lib/agent/use-agent'

export default function Home() {
  const { state, audioLevel, messages } = useAgent()

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <WaveCanvas state={state} audioLevel={audioLevel} />

      {/* Subtle state indicator */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10">
          <div className={`w-2 h-2 rounded-full ${
            state === 'idle' ? 'bg-white/40' :
            state === 'listening' ? 'bg-green-400 animate-pulse' :
            state === 'thinking' ? 'bg-yellow-400 animate-pulse' :
            state === 'speaking' ? 'bg-violet-400 animate-pulse' :
            'bg-white/40'
          }`} />
          <span className="text-xs text-white/60 font-mono uppercase tracking-wider">
            {state}
          </span>
        </div>
      </div>
    </main>
  )
}
```

**Step 5: Add Web Speech API types**

Create `types/speech.d.ts`:

```ts
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface Window {
  SpeechRecognition: new () => SpeechRecognition
  webkitSpeechRecognition: new () => SpeechRecognition
}
```

**Step 6: Verify agent loop runs**

```bash
npm run dev
```

Open localhost:3000 in Chrome. Allow microphone. Verify state indicator shows "idle" then "listening" when you speak.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: agent state machine with speech I/O and audio reactivity"
```

---

### Task 4: Claude Chat API Route

**Files:**
- Create: `app/api/chat/route.ts`

**Step 1: Create the chat endpoint**

Create `app/api/chat/route.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const runtime = 'nodejs'

const SYSTEM_PROMPT = `You are Izzy, a friendly and perceptive AI voice companion. You speak naturally and conversationally, like a thoughtful friend. Keep responses concise (1-3 sentences) since they'll be spoken aloud. Be warm but not saccharine. Match the user's energy — if they're brief, be brief. If they want to go deep, go deep.`

const IDLE_PROMPT = `The user has been quiet for a while. Based on the conversation so far, generate a brief, natural prompt to re-engage them. If there's no prior conversation, say something friendly and open-ended — maybe share an interesting thought or ask what's on their mind. Keep it to 1-2 sentences. Do NOT say "are you still there" or anything that feels like a bot check.`

export async function POST(req: Request) {
  const { messages, isIdlePrompt } = await req.json()

  const systemContent = isIdlePrompt
    ? `${SYSTEM_PROMPT}\n\n${IDLE_PROMPT}`
    : SYSTEM_PROMPT

  const apiMessages = messages.length > 0
    ? messages
    : [{ role: 'user' as const, content: 'Hello' }]

  // For idle prompts with no context, add a synthetic user message
  const finalMessages = isIdlePrompt && messages.length === 0
    ? [{ role: 'user' as const, content: '[The conversation is just starting. Say something to engage the user.]' }]
    : apiMessages

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: systemContent,
      messages: finalMessages,
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    return Response.json({ response: text })
  } catch (error) {
    console.error('Claude API error:', error)
    return Response.json(
      { response: "I'm having a moment. Let me gather my thoughts." },
      { status: 500 }
    )
  }
}
```

**Step 2: Add NEXT_PUBLIC env var for idle timeout**

Add to `.env.local`:

```
NEXT_PUBLIC_IDLE_TIMEOUT_MS=300000
```

**Step 3: Test the API route**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"isIdlePrompt":false}'
```

Expected: JSON with `response` field containing Claude's reply.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: Claude chat API route with idle prompting"
```

---

### Task 5: Memory System

**Files:**
- Create: `lib/memory/db.ts`
- Create: `lib/memory/schema.ts`
- Create: `lib/memory/store.ts`
- Create: `lib/memory/graph.ts`
- Create: `app/api/memory/route.ts`

**Step 1: Create database singleton**

Create `lib/memory/db.ts`:

```ts
import Database from 'better-sqlite3'

declare global {
  var __db: ReturnType<typeof Database> | undefined
}

function createDb() {
  const db = new Database(process.env.DB_PATH ?? 'data/izzy.db')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export const db = globalThis.__db ?? createDb()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__db = db
}
```

**Step 2: Create schema initialization**

Create `lib/memory/schema.ts`:

```ts
import { db } from './db'

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tier TEXT NOT NULL CHECK(tier IN ('short_term', 'long_term')),
      tags TEXT NOT NULL DEFAULT '[]',
      priority REAL NOT NULL DEFAULT 0.5,
      embedding BLOB,
      created_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL,
      decay_rate REAL NOT NULL DEFAULT 0.01
    );

    CREATE TABLE IF NOT EXISTS memory_edges (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      PRIMARY KEY (source_id, target_id, relation),
      FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);
    CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(priority DESC);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
  `)
}

// Auto-init on import
initSchema()
```

**Step 3: Create memory store**

Create `lib/memory/store.ts`:

```ts
import { v4 as uuid } from 'uuid'
import { db } from './db'
import './schema'

export interface Memory {
  id: string
  content: string
  tier: 'short_term' | 'long_term'
  tags: string[]
  priority: number
  created_at: number
  last_accessed: number
  decay_rate: number
}

export interface CreateMemoryInput {
  content: string
  tier: 'short_term' | 'long_term'
  tags?: string[]
  priority?: number
  decay_rate?: number
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO memories (id, content, tier, tags, priority, created_at, last_accessed, decay_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getById: db.prepare('SELECT * FROM memories WHERE id = ?'),
  search: db.prepare(`
    SELECT * FROM memories
    WHERE tier = ? AND priority > 0.05
    ORDER BY priority DESC, last_accessed DESC
    LIMIT ?
  `),
  searchByTags: db.prepare(`
    SELECT * FROM memories
    WHERE priority > 0.05
    ORDER BY priority DESC, last_accessed DESC
    LIMIT ?
  `),
  updateAccess: db.prepare('UPDATE memories SET last_accessed = ? WHERE id = ?'),
  decay: db.prepare('UPDATE memories SET priority = MAX(0, priority - decay_rate) WHERE priority > 0'),
  promote: db.prepare("UPDATE memories SET tier = 'long_term' WHERE id = ?"),
  insertEdge: db.prepare(`
    INSERT OR REPLACE INTO memory_edges (source_id, target_id, relation, weight)
    VALUES (?, ?, ?, ?)
  `),
  getEdges: db.prepare('SELECT * FROM memory_edges WHERE source_id = ?'),
  getAll: db.prepare('SELECT * FROM memories WHERE priority > 0.05 ORDER BY priority DESC'),
}

export function createMemory(input: CreateMemoryInput): Memory {
  const now = Date.now()
  const id = uuid()
  const memory: Memory = {
    id,
    content: input.content,
    tier: input.tier,
    tags: input.tags ?? [],
    priority: input.priority ?? 0.5,
    created_at: now,
    last_accessed: now,
    decay_rate: input.decay_rate ?? (input.tier === 'short_term' ? 0.02 : 0.005),
  }

  stmts.insert.run(
    memory.id,
    memory.content,
    memory.tier,
    JSON.stringify(memory.tags),
    memory.priority,
    memory.created_at,
    memory.last_accessed,
    memory.decay_rate,
  )

  return memory
}

export function getMemory(id: string): Memory | null {
  const row = stmts.getById.get(id) as any
  if (!row) return null
  stmts.updateAccess.run(Date.now(), id)
  return { ...row, tags: JSON.parse(row.tags) }
}

export function searchMemories(opts: { tier?: string; tags?: string[]; limit?: number }): Memory[] {
  const limit = opts.limit ?? 10
  let rows: any[]

  if (opts.tier) {
    rows = stmts.search.all(opts.tier, limit) as any[]
  } else {
    rows = stmts.searchByTags.all(limit) as any[]
  }

  // Tag-based filtering in JS (simple for now, replace with FTS later)
  if (opts.tags && opts.tags.length > 0) {
    rows = rows.filter((row) => {
      const memTags: string[] = JSON.parse(row.tags)
      return opts.tags!.some((t) => memTags.includes(t))
    })
  }

  return rows.map((row) => ({ ...row, tags: JSON.parse(row.tags) }))
}

export function getRelevantMemories(keywords: string[], limit = 5): Memory[] {
  const all = stmts.getAll.all() as any[]
  const scored = all.map((row) => {
    const tags: string[] = JSON.parse(row.tags)
    const contentLower = row.content.toLowerCase()
    let score = row.priority

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      if (tags.some((t) => t.toLowerCase().includes(kwLower))) score += 0.3
      if (contentLower.includes(kwLower)) score += 0.2
    }

    // Recency boost
    const ageHours = (Date.now() - row.last_accessed) / (1000 * 60 * 60)
    score += Math.max(0, 1 - ageHours / 24) * 0.2

    return { ...row, tags, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

export function addEdge(sourceId: string, targetId: string, relation: string, weight = 1.0) {
  stmts.insertEdge.run(sourceId, targetId, relation, weight)
}

export function decayMemories() {
  stmts.decay.run()
}

export function promoteMemory(id: string) {
  stmts.promote.run(id)
}
```

**Step 4: Create graph module**

Create `lib/memory/graph.ts`:

```ts
import { db } from './db'
import './schema'

interface GraphNode {
  id: string
  edges: Map<string, { relation: string; weight: number }>
}

export class MemoryGraph {
  private nodes: Map<string, GraphNode> = new Map()

  loadFromDb() {
    const edges = db.prepare('SELECT * FROM memory_edges').all() as any[]
    this.nodes.clear()

    for (const edge of edges) {
      if (!this.nodes.has(edge.source_id)) {
        this.nodes.set(edge.source_id, { id: edge.source_id, edges: new Map() })
      }
      if (!this.nodes.has(edge.target_id)) {
        this.nodes.set(edge.target_id, { id: edge.target_id, edges: new Map() })
      }
      this.nodes.get(edge.source_id)!.edges.set(edge.target_id, {
        relation: edge.relation,
        weight: edge.weight,
      })
    }
  }

  getRelated(memoryId: string, depth = 2): string[] {
    const visited = new Set<string>()
    const queue: Array<{ id: string; d: number }> = [{ id: memoryId, d: 0 }]

    while (queue.length > 0) {
      const { id, d } = queue.shift()!
      if (visited.has(id) || d > depth) continue
      visited.add(id)

      const node = this.nodes.get(id)
      if (node) {
        for (const [targetId] of node.edges) {
          if (!visited.has(targetId)) {
            queue.push({ id: targetId, d: d + 1 })
          }
        }
      }
    }

    visited.delete(memoryId)
    return Array.from(visited)
  }
}
```

**Step 5: Create memory API route**

Create `app/api/memory/route.ts`:

```ts
import { createMemory, searchMemories, getRelevantMemories, decayMemories } from '@/lib/memory/store'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json()
  const { action } = body

  switch (action) {
    case 'create': {
      const memory = createMemory(body.memory)
      return Response.json({ memory })
    }
    case 'search': {
      const memories = searchMemories(body.opts ?? {})
      return Response.json({ memories })
    }
    case 'relevant': {
      const memories = getRelevantMemories(body.keywords ?? [], body.limit)
      return Response.json({ memories })
    }
    case 'decay': {
      decayMemories()
      return Response.json({ ok: true })
    }
    default:
      return Response.json({ error: 'Unknown action' }, { status: 400 })
  }
}
```

**Step 6: Test memory API**

```bash
curl -X POST http://localhost:3000/api/memory \
  -H "Content-Type: application/json" \
  -d '{"action":"create","memory":{"content":"User likes TypeScript","tier":"long_term","tags":["preference","typescript"]}}'
```

Expected: JSON with created memory object.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: tiered memory system with SQLite, graph, and API routes"
```

---

### Task 6: Integrate Memory into Agent Loop

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `lib/agent/use-agent.ts`

**Step 1: Update chat route to use memory context**

Replace `app/api/chat/route.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { getRelevantMemories, createMemory, decayMemories } from '@/lib/memory/store'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const runtime = 'nodejs'

const SYSTEM_PROMPT = `You are Izzy, a friendly and perceptive AI voice companion. You speak naturally and conversationally, like a thoughtful friend. Keep responses concise (1-3 sentences) since they'll be spoken aloud. Be warm but not saccharine. Match the user's energy.`

const IDLE_PROMPT = `The user has been quiet for a while. Based on the conversation so far and any memories you have, generate a brief, natural prompt to re-engage them. If there's no prior conversation, say something friendly and open-ended. Keep it to 1-2 sentences. Do NOT say "are you still there" or anything robotic.`

const MEMORY_EXTRACT_PROMPT = `Based on this conversation exchange, identify any facts, preferences, or important information worth remembering about the user. Return a JSON array of objects with "content" (the fact), "tags" (relevant keywords), and "tier" ("short_term" or "long_term"). Return an empty array if nothing notable. Only return the JSON array, no other text.`

export async function POST(req: Request) {
  const { messages, isIdlePrompt } = await req.json()

  // Decay memories periodically (simple approach)
  decayMemories()

  // Extract keywords from recent messages for memory lookup
  const recentText = messages.slice(-3).map((m: any) => m.content).join(' ')
  const keywords = recentText.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 10)

  // Fetch relevant memories
  const memories = getRelevantMemories(keywords, 5)
  const memoryContext = memories.length > 0
    ? `\n\nThings you remember about the user:\n${memories.map((m) => `- ${m.content}`).join('\n')}`
    : ''

  const systemContent = isIdlePrompt
    ? `${SYSTEM_PROMPT}${memoryContext}\n\n${IDLE_PROMPT}`
    : `${SYSTEM_PROMPT}${memoryContext}`

  const apiMessages = messages.length > 0
    ? messages.slice(-20) // Keep context window manageable
    : [{ role: 'user' as const, content: 'Hello' }]

  const finalMessages = isIdlePrompt && messages.length === 0
    ? [{ role: 'user' as const, content: '[The conversation is just starting. Say something to engage the user.]' }]
    : apiMessages

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: systemContent,
      messages: finalMessages,
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    // Async memory extraction (fire and forget)
    extractMemories(messages.slice(-4)).catch(console.error)

    return Response.json({ response: text })
  } catch (error) {
    console.error('Claude API error:', error)
    return Response.json(
      { response: "I'm having a moment. Let me gather my thoughts." },
      { status: 500 }
    )
  }
}

async function extractMemories(recentMessages: Array<{ role: string; content: string }>) {
  if (recentMessages.length < 2) return

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: MEMORY_EXTRACT_PROMPT,
      messages: [
        {
          role: 'user',
          content: recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n'),
        },
      ],
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      for (const mem of parsed) {
        createMemory({
          content: mem.content,
          tier: mem.tier ?? 'short_term',
          tags: mem.tags ?? [],
          priority: mem.tier === 'long_term' ? 0.8 : 0.5,
        })
      }
    }
  } catch {
    // Memory extraction is best-effort
  }
}
```

**Step 2: Verify full loop**

```bash
npm run dev
```

Test: Speak into mic → see state transition → hear response → memories stored.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: integrate memory retrieval and extraction into agent loop"
```

---

### Task 7: Polish & Dark/Light Mode

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Step 1: Add subtle gradient overlay and polish**

Update `app/globals.css`:

```css
@import "tailwindcss";

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

@media (prefers-color-scheme: dark) {
  body {
    background: #0a0a1a;
    color: rgba(255, 255, 255, 0.8);
  }
}

@media (prefers-color-scheme: light) {
  body {
    background: #f8f6ff;
    color: rgba(0, 0, 0, 0.8);
  }
}

/* Subtle vignette overlay */
.vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

@media (prefers-color-scheme: dark) {
  .vignette {
    background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.4) 100%);
  }
}

@media (prefers-color-scheme: light) {
  .vignette {
    background: radial-gradient(ellipse at center, transparent 50%, rgba(200, 195, 220, 0.3) 100%);
  }
}
```

**Step 2: Add vignette and transcript display to page**

Update `app/page.tsx`:

```tsx
'use client'

import { WaveCanvas } from '@/components/WaveCanvas'
import { useAgent } from '@/lib/agent/use-agent'

export default function Home() {
  const { state, audioLevel, messages } = useAgent()
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <WaveCanvas state={state} audioLevel={audioLevel} />
      <div className="vignette" />

      {/* Last message display */}
      {lastMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-10 max-w-lg text-center">
          <p className="text-sm text-white/40 font-mono mb-1">
            {lastMessage.role === 'user' ? 'you' : 'izzy'}
          </p>
          <p className="text-white/70 text-lg leading-relaxed">
            {lastMessage.content}
          </p>
        </div>
      )}

      {/* State indicator */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10">
          <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${
            state === 'idle' ? 'bg-white/40' :
            state === 'listening' ? 'bg-green-400 animate-pulse' :
            state === 'thinking' ? 'bg-yellow-400 animate-pulse' :
            state === 'speaking' ? 'bg-violet-400 animate-pulse' :
            'bg-white/40'
          }`} />
          <span className="text-xs text-white/60 font-mono uppercase tracking-wider">
            {state}
          </span>
        </div>
      </div>
    </main>
  )
}
```

**Step 3: Verify full experience**

```bash
npm run dev
```

Check: dark mode gradient, vignette overlay, message display, full agent loop.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: polish UI with vignette, gradient, and message display"
```
