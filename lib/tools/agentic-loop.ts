import Anthropic from '@anthropic-ai/sdk'
import { assembleTools } from './registry'
import { executeToolCall } from './executor'
import type { AgenticLoopResult, ToolCallRecord, ToolContext } from '@/lib/capabilities/types'
import type { ToolStreamEvent } from './stream-types'

const MAX_TOOL_ROUNDS = 10

export async function runAgenticLoop(
  client: Anthropic,
  systemPrompt: string,
  messages: Anthropic.Messages.MessageParam[],
  toolContext: ToolContext,
  onToolEvent?: (event: ToolStreamEvent) => void,
): Promise<AgenticLoopResult> {
  const tools = assembleTools(toolContext)
  const toolCalls: ToolCallRecord[] = []
  let pendingQuestion: string | null = null
  let buildId: string | null = null

  // Inject onToolEvent into the toolContext so individual handlers can emit progress
  const ctxWithEmit = { ...toolContext, onToolEvent: onToolEvent }

  // Working copy of messages that accumulates tool_use/tool_result blocks
  const workingMessages: Anthropic.Messages.MessageParam[] = [...messages]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: workingMessages,
      tools,
    })

    // If stop_reason is NOT 'tool_use', extract text and return
    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      return { text, toolCalls, pendingQuestion, buildId }
    }

    // Process all tool_use blocks in this response
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    )

    // Add the full assistant response (including tool_use blocks) to messages
    workingMessages.push({ role: 'assistant', content: response.content })

    // Execute each tool and collect results
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

    for (const block of toolUseBlocks) {
      const input = block.input as Record<string, unknown>
      let resultContent: string
      let isError = false

      // Emit tool_start
      onToolEvent?.({ type: 'tool_start', name: block.name, input })

      try {
        // Special handling for ask_user: short-circuit the loop
        if (block.name === 'ask_user') {
          pendingQuestion = (input.question as string) ?? 'Could you tell me more?'
          resultContent = '[Waiting for user response]'
        } else {
          resultContent = await executeToolCall(block.name, input, ctxWithEmit)

          // Check if request_capability was called — extract buildId for the caller
          if (block.name === 'request_capability') {
            try {
              const parsed = JSON.parse(resultContent)
              if (parsed.status === 'building' && parsed.capability_id) {
                buildId = parsed.capability_id
              }
            } catch {
              // Not JSON, ignore
            }
          }
        }
      } catch (err) {
        resultContent = err instanceof Error ? err.message : String(err)
        isError = true
      }

      // Emit tool_result
      onToolEvent?.({ type: 'tool_result', name: block.name, result: resultContent, isError })

      toolCalls.push({ name: block.name, input, result: resultContent, isError })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultContent,
        is_error: isError,
      })
    }

    // Add all tool results as a single user message
    workingMessages.push({ role: 'user', content: toolResults })

    // If ask_user was called, break the loop
    if (pendingQuestion) {
      return {
        text: pendingQuestion,
        toolCalls,
        pendingQuestion,
        buildId,
      }
    }
  }

  // Safety: exceeded max rounds
  return {
    text: "I got a bit caught in a loop there. Let me try a different approach.",
    toolCalls,
    pendingQuestion: null,
    buildId: null,
  }
}
