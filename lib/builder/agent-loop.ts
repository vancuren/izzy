import Anthropic from '@anthropic-ai/sdk'
import type { Sandbox } from '@e2b/code-interpreter'
import { BUILDER_SYSTEM_PROMPT } from './system-prompt'
import { BUILDER_TOOLS, handleBuilderToolCall, type BuilderToolContext } from './tools'
import { createSandbox, destroySandbox } from '@/lib/sandbox/e2b-client'
import { pushMessage } from '@/lib/queue/builder-queue'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_ITERATIONS = 25

export interface BuildRequest {
  buildId: string
  capabilityId?: string
  description: string
}

export interface BuildResult {
  success: boolean
  capabilityId?: string
  error?: string
}

export async function runBuilderLoop(request: BuildRequest): Promise<BuildResult> {
  let sandbox: Sandbox | null = null

  try {
    // 1. Create sandbox (10 min lifetime for building)
    sandbox = await createSandbox({ timeoutMs: 600_000 })

    const ctx: BuilderToolContext = {
      sandbox,
      buildId: request.buildId,
      catalogCapabilityId: request.capabilityId,
    }

    // 2. Initialize conversation
    const messages: Anthropic.Messages.MessageParam[] = [
      {
        role: 'user',
        content: `Build the following capability:\n\n${request.description}`,
      },
    ]

    pushMessage(request.buildId, 'to_user', 'progress', {
      step: 'Starting build',
      detail: 'Sandbox created, builder agent starting...',
    })

    // 3. Agentic loop
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: BUILDER_SYSTEM_PROMPT,
        tools: BUILDER_TOOLS,
        messages,
      })

      // Add assistant message
      messages.push({ role: 'assistant', content: response.content })

      // Check if we are done (no tool use)
      if (response.stop_reason === 'end_turn') {
        if (!ctx.capabilityId) {
          pushMessage(request.buildId, 'to_user', 'error', {
            error: 'Builder finished without registering a capability.',
            recoverable: false,
          })
          return { success: false, error: 'Builder finished without registering' }
        }
        return { success: true, capabilityId: ctx.capabilityId }
      }

      // Process tool calls
      if (response.stop_reason === 'tool_use') {
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            try {
              const result = await handleBuilderToolCall(
                block.name,
                block.input as Record<string, unknown>,
                ctx,
              )
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: result,
              })
            } catch (err) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
                is_error: true,
              })
            }
          }
        }

        messages.push({ role: 'user', content: toolResults })

        // Check if register_capability was called
        if (ctx.capabilityId) {
          return { success: true, capabilityId: ctx.capabilityId }
        }
      }
    }

    // Exceeded iteration limit
    pushMessage(request.buildId, 'to_user', 'error', {
      error: 'Builder exceeded maximum iterations.',
      recoverable: false,
    })
    return { success: false, error: 'Exceeded max iterations' }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    pushMessage(request.buildId, 'to_user', 'error', {
      error: errorMsg,
      recoverable: false,
    })
    return { success: false, error: errorMsg }
  } finally {
    if (sandbox) {
      await destroySandbox(sandbox)
    }
  }
}
