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
