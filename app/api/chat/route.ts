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
