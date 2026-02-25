import type Anthropic from '@anthropic-ai/sdk'
import type { Memory, CreateMemoryInput } from '@/lib/memory/store'
import type { ToolStreamEvent } from '@/lib/tools/stream-types'

// ── Capability Catalog Types ────────────────────────────────

export type CapabilityStatus = 'building' | 'active' | 'failed' | 'disabled'
export type CapabilityRuntime = 'python'

export interface Capability {
  id: string
  name: string
  description: string
  version: number
  status: CapabilityStatus
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  tags: string[]
  path: string
  created_at: number
  updated_at: number
}

export interface CreateCapabilityInput {
  name: string
  description: string
  input_schema?: Record<string, unknown>
  output_schema?: Record<string, unknown>
  tags?: string[]
}

// ── Tool System Types ───────────────────────────────────────

export type AnthropicTool = Anthropic.Messages.Tool

export interface BuiltInToolDef {
  definition: AnthropicTool
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<string>
}

export interface ToolContext {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  memory: {
    create: (input: CreateMemoryInput) => Memory
    search: (opts: { tier?: string; tags?: string[]; limit?: number }) => Memory[]
    getRelevant: (keywords: string[], limit?: number) => Memory[]
  }
  catalog: {
    lookup: (name: string) => Capability | null
    list: (filter?: { status?: CapabilityStatus }) => Capability[]
    create: (input: CreateCapabilityInput) => Capability
    toAnthropicTool: (cap: Capability) => AnthropicTool
  }
  onToolEvent?: (event: ToolStreamEvent) => void
}

// ── Agentic Loop Types ──────────────────────────────────────

export interface ToolCallRecord {
  name: string
  input: Record<string, unknown>
  result: string
  isError: boolean
}

export interface AgenticLoopResult {
  text: string
  toolCalls: ToolCallRecord[]
  pendingQuestion: string | null
  buildId: string | null
}
