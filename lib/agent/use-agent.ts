'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AgentContext, AgentEvent, transition, createInitialContext } from './state-machine'
import { createSpeechRecognition, speak, createAudioAnalyser } from './speech'

const IDLE_TIMEOUT_MS = parseInt(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS ?? '300000', 10)

export function useAgent() {
  const [ctx, setCtx] = useState<AgentContext>(createInitialContext)
  const [audioLevel, setAudioLevel] = useState(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const analyserRef = useRef<ReturnType<typeof createAudioAnalyser>>(null)
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioFrameRef = useRef<number>(0)
  const ctxRef = useRef(ctx)

  // Keep ctxRef in sync
  useEffect(() => {
    ctxRef.current = ctx
  }, [ctx])

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
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start()
            } catch {
              // Already started
            }
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
          } catch {
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
      } else if (ctxRef.current.state === 'idle') {
        dispatch({ type: 'SPEECH_DETECTED' })
      }
    }

    recognition.onend = () => {
      // Auto-restart if in idle state
      if (ctxRef.current.state === 'idle') {
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
  }, [dispatch])

  return {
    state: ctx.state,
    audioLevel,
    messages: ctx.messages,
  }
}
