import type { ToolContext } from '@/lib/capabilities/types'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

const MAX_CONTENT_LENGTH = 4000

export async function handleBrowserUse(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const url = input.url as string
  const extract = (input.extract as string) ?? 'summary'
  const emit = ctx.onToolEvent

  emit?.({ type: 'tool_progress', name: 'browser_use', data: { status: 'loading', url } })

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; IzzyBot/1.0; +https://github.com/izzy)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`)
    }

    const html = await res.text()
    const { document } = parseHTML(html)
    const reader = new Readability(document as unknown as Document)
    const article = reader.parse()

    if (!article) {
      return JSON.stringify({
        url,
        error: true,
        message: 'Could not extract readable content from the page.',
      })
    }

    emit?.({
      type: 'tool_progress',
      name: 'browser_use',
      data: { status: 'reading', title: article.title, byline: article.byline },
    })

    let content = (article.textContent ?? '').trim()
    if (extract === 'summary' || content.length > MAX_CONTENT_LENGTH) {
      content = content.slice(0, MAX_CONTENT_LENGTH)
      if (content.length === MAX_CONTENT_LENGTH) {
        content += '\n\n[Content truncated]'
      }
    }

    return JSON.stringify({
      url,
      title: article.title,
      byline: article.byline,
      excerpt: article.excerpt,
      content,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ url, error: true, message })
  }
}
