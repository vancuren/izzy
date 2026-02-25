import type { ToolContext } from '@/lib/capabilities/types'

const TAVILY_API_URL = 'https://api.tavily.com/search'

interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

interface TavilyResponse {
  results: TavilyResult[]
  query: string
}

export async function handleWebSearch(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const query = input.query as string
  const maxResults = (input.max_results as number) ?? 5
  const emit = ctx.onToolEvent

  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    return JSON.stringify({
      error: true,
      message: 'Web search is not configured. TAVILY_API_KEY environment variable is not set.',
    })
  }

  emit?.({ type: 'tool_progress', name: 'web_search', data: { status: 'searching', query } })

  try {
    const res = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: false,
      }),
    })

    if (!res.ok) {
      throw new Error(`Tavily API error: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as TavilyResponse

    emit?.({
      type: 'tool_progress',
      name: 'web_search',
      data: { status: 'results', count: data.results.length },
    })

    return JSON.stringify({
      query,
      results: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        score: r.score,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: true, message })
  }
}
