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
