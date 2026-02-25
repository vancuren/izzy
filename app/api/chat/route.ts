import Anthropic from '@anthropic-ai/sdk'
import { getRelevantMemories, createMemory, decayMemories } from '@/lib/memory/store'
import { listCapabilities } from '@/lib/capabilities/catalog'
import { runAgenticLoop } from '@/lib/tools/agentic-loop'
import { createToolContext } from '@/lib/tools/context'
import type { ToolStreamEvent } from '@/lib/tools/stream-types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const runtime = 'nodejs'

const BASE_SYSTEM_PROMPT = `You are Izzy, a friendly and perceptive AI voice companion. You speak naturally and conversationally, like a thoughtful friend. Keep responses concise (1-3 sentences) since they'll be spoken aloud. Be warm but not saccharine. Match the user's energy.

You have core capabilities:
- web_search: Search the web for current information, news, facts
- browser_use: Read content from a specific URL
- deep_memory: Deep search your memories about the user
- reason: Think step-by-step through complex questions

You also have tools for managing capabilities (lookup, request, execute) and memory (store, recall).

Use these naturally. For simple conversation, respond directly. For questions about current events, search the web. For URLs, browse them. For complex questions, reason through them. For personal details about the user, check your deep memory. When you don't have a capability the user needs, use request_capability to build one. Let the user know you're working on it.`

const IDLE_PROMPT = `The user has been quiet for a while. Based on the conversation so far and any memories you have, generate a brief, natural prompt to re-engage them. If there's no prior conversation, say something friendly and open-ended. Keep it to 1-2 sentences. Do NOT say "are you still there" or anything robotic.`

const MEMORY_EXTRACT_PROMPT = `Based on this conversation exchange, identify any facts, preferences, or important information worth remembering about the user. Return a JSON array of objects with "content" (the fact), "tags" (relevant keywords), and "tier" ("short_term" or "long_term"). Return an empty array if nothing notable. Only return the JSON array, no other text.`

function buildSystemPrompt(memoryContext: string, capabilitySummary: string, isIdlePrompt: boolean): string {
  let prompt = `${BASE_SYSTEM_PROMPT}${memoryContext}${capabilitySummary}`
  if (isIdlePrompt) {
    prompt += `\n\n${IDLE_PROMPT}`
  }
  return prompt
}

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: Request) {
  const { messages, isIdlePrompt } = await req.json()

  // Decay memories periodically
  decayMemories()

  // Extract keywords from recent messages for memory lookup
  const recentText = messages.slice(-3).map((m: { content: string }) => m.content).join(' ')
  const keywords = recentText.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 10)

  // Fetch relevant memories
  const memories = getRelevantMemories(keywords, 5)
  const memoryContext = memories.length > 0
    ? `\n\nThings you remember about the user:\n${memories.map((m) => `- ${m.content}`).join('\n')}`
    : ''

  // Build capability summary for context
  const capabilities = listCapabilities({ status: 'active' })
  const capabilitySummary = capabilities.length > 0
    ? `\n\nAvailable capabilities:\n${capabilities.map((c) => `- ${c.name}: ${c.description}`).join('\n')}`
    : ''

  const systemContent = buildSystemPrompt(memoryContext, capabilitySummary, isIdlePrompt)

  const apiMessages = messages.length > 0
    ? messages.slice(-20)
    : [{ role: 'user' as const, content: 'Hello' }]

  const finalMessages = isIdlePrompt && messages.length === 0
    ? [{ role: 'user' as const, content: '[The conversation is just starting. Say something to engage the user.]' }]
    : apiMessages

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const toolContext = createToolContext(messages)

        const onToolEvent = (event: ToolStreamEvent) => {
          controller.enqueue(encoder.encode(sseEncode(event.type, event)))
        }

        const result = await runAgenticLoop(
          client,
          systemContent,
          finalMessages,
          toolContext,
          onToolEvent,
        )

        // If a capability build was requested, trigger the builder
        if (result.buildId) {
          triggerBuilder(result.buildId, result.toolCalls).catch(console.error)
        }

        // Async memory extraction (fire and forget)
        extractMemories(messages.slice(-4)).catch(console.error)

        // Send final response
        controller.enqueue(
          encoder.encode(
            sseEncode('response', {
              text: result.text,
              buildId: result.buildId,
              pendingQuestion: result.pendingQuestion,
              toolCalls: result.toolCalls,
            }),
          ),
        )
      } catch (error) {
        console.error('Claude API error:', error)
        controller.enqueue(
          encoder.encode(
            sseEncode('response', {
              text: "I'm having a moment. Let me gather my thoughts.",
              buildId: null,
              pendingQuestion: null,
              toolCalls: [],
            }),
          ),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

async function triggerBuilder(
  buildId: string,
  toolCalls: Array<{ name: string; input: Record<string, unknown>; result: string }>,
) {
  const requestCall = toolCalls.find((tc) => tc.name === 'request_capability')
  if (!requestCall) return

  const description = requestCall.input.description as string
  const name = requestCall.input.name as string

  // Dynamic import to avoid loading e2b at module init time
  const { runBuilderLoop } = await import('@/lib/builder/agent-loop')

  runBuilderLoop({
    buildId,
    description: `Build a capability called "${name}": ${description}`,
  }).catch((err) => {
    console.error('Builder loop failed:', err)
  })
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
