import Anthropic from '@anthropic-ai/sdk'
import type { ToolContext } from '@/lib/capabilities/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function handleDeepMemory(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const query = input.query as string
  const emit = ctx.onToolEvent

  emit?.({ type: 'tool_progress', name: 'deep_memory', data: { status: 'expanding', query } })

  // Step 1: Use Claude to generate multiple search angles
  let keywordSets: string[][]
  try {
    const expandResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:
        'Generate 3-5 sets of search keywords to find relevant memories about a user query. Return ONLY a JSON array of arrays of strings. Example: [["keyword1","keyword2"],["keyword3","keyword4"]]',
      messages: [{ role: 'user', content: query }],
    })

    const expandText = expandResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    keywordSets = JSON.parse(expandText)
    if (!Array.isArray(keywordSets)) {
      keywordSets = [[query]]
    }
  } catch {
    // Fallback: split query into simple keyword sets
    const words = query.split(/\s+/).filter((w) => w.length > 2)
    keywordSets = [words]
  }

  emit?.({
    type: 'tool_progress',
    name: 'deep_memory',
    data: { status: 'searching', searches: keywordSets },
  })

  // Step 2: Run parallel memory searches
  const allResults = await Promise.all(
    keywordSets.map((keywords) => ctx.memory.getRelevant(keywords, 5)),
  )

  // Deduplicate by memory id
  const seen = new Set<string>()
  const uniqueMemories = allResults
    .flat()
    .filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10)

  emit?.({
    type: 'tool_progress',
    name: 'deep_memory',
    data: {
      status: 'found',
      count: uniqueMemories.length,
      memories: uniqueMemories.map((m) => ({
        content: m.content,
        tags: m.tags,
        tier: m.tier,
      })),
    },
  })

  if (uniqueMemories.length === 0) {
    return JSON.stringify({
      found: false,
      message: 'No relevant memories found for this query.',
    })
  }

  // Step 3: Synthesize findings
  try {
    const synthesisResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:
        'You are summarizing memories about a user. Synthesize the following memory fragments into a coherent, concise summary relevant to the query. Be factual and specific.',
      messages: [
        {
          role: 'user',
          content: `Query: ${query}\n\nMemories:\n${uniqueMemories.map((m) => `- [${m.tier}] ${m.content} (tags: ${m.tags.join(', ')})`).join('\n')}`,
        },
      ],
    })

    const synthesis = synthesisResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return JSON.stringify({
      found: true,
      count: uniqueMemories.length,
      synthesis,
      memories: uniqueMemories.map((m) => ({
        content: m.content,
        tags: m.tags,
        tier: m.tier,
        priority: m.priority,
      })),
    })
  } catch {
    // Fallback: return raw memories without synthesis
    return JSON.stringify({
      found: true,
      count: uniqueMemories.length,
      memories: uniqueMemories.map((m) => ({
        content: m.content,
        tags: m.tags,
        tier: m.tier,
        priority: m.priority,
      })),
    })
  }
}
