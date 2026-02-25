import Anthropic from '@anthropic-ai/sdk'
import { getRelevantMemories, createMemory, decayMemories } from '@/lib/memory/store'
import { listCapabilities } from '@/lib/capabilities/catalog'
import { runAgenticLoop } from '@/lib/tools/agentic-loop'
import { createToolContext } from '@/lib/tools/context'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const runtime = 'nodejs'

const BASE_SYSTEM_PROMPT = `You are Izzy, a friendly and perceptive AI voice companion. You speak naturally and conversationally, like a thoughtful friend. Keep responses concise (1-3 sentences) since they'll be spoken aloud. Be warm but not saccharine. Match the user's energy.

You have access to tools. Use them when the user's request requires looking up, creating, or executing capabilities, or when you need to store/recall specific information. For simple conversation, just respond directly without tools.

When you don't have a capability the user needs, use request_capability to build one. Let the user know you're working on it.`

const IDLE_PROMPT = `The user has been quiet for a while. Based on the conversation so far and any memories you have, generate a brief, natural prompt to re-engage them. If there's no prior conversation, say something friendly and open-ended. Keep it to 1-2 sentences. Do NOT say "are you still there" or anything robotic.`

const MEMORY_EXTRACT_PROMPT = `Based on this conversation exchange, identify any facts, preferences, or important information worth remembering about the user. Return a JSON array of objects with "content" (the fact), "tags" (relevant keywords), and "tier" ("short_term" or "long_term"). Return an empty array if nothing notable. Only return the JSON array, no other text.`

function buildSystemPrompt(memoryContext: string, capabilitySummary: string, isIdlePrompt: boolean): string {
  let prompt = `${BASE_SYSTEM_PROMPT}${memoryContext}${capabilitySummary}`
  if (isIdlePrompt) {
    prompt += `\n\n${IDLE_PROMPT}`
  }
  return prompt
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

  try {
    const toolContext = createToolContext(messages)

    const result = await runAgenticLoop(
      client,
      systemContent,
      finalMessages,
      toolContext,
    )

    // If a capability build was requested, trigger the builder
    if (result.buildId) {
      triggerBuilder(result.buildId, result.toolCalls).catch(console.error)
    }

    // Async memory extraction (fire and forget)
    extractMemories(messages.slice(-4)).catch(console.error)

    return Response.json({
      response: result.text,
      toolCalls: result.toolCalls,
      pendingQuestion: result.pendingQuestion,
      buildId: result.buildId,
    })
  } catch (error) {
    console.error('Claude API error:', error)
    return Response.json(
      { response: "I'm having a moment. Let me gather my thoughts." },
      { status: 500 }
    )
  }
}

async function triggerBuilder(
  buildId: string,
  toolCalls: Array<{ name: string; input: Record<string, unknown>; result: string }>,
) {
  // Find the request_capability tool call to get the description
  const requestCall = toolCalls.find((tc) => tc.name === 'request_capability')
  if (!requestCall) return

  const description = requestCall.input.description as string
  const name = requestCall.input.name as string

  try {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/builder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildId,
        description: `Build a capability called "${name}": ${description}`,
      }),
    })
  } catch (err) {
    console.error('Failed to trigger builder:', err)
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
