import { createMemory, searchMemories, getRelevantMemories, decayMemories } from '@/lib/memory/store'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json()
  const { action } = body

  switch (action) {
    case 'create': {
      const memory = createMemory(body.memory)
      return Response.json({ memory })
    }
    case 'search': {
      const memories = searchMemories(body.opts ?? {})
      return Response.json({ memories })
    }
    case 'relevant': {
      const memories = getRelevantMemories(body.keywords ?? [], body.limit)
      return Response.json({ memories })
    }
    case 'decay': {
      decayMemories()
      return Response.json({ ok: true })
    }
    default:
      return Response.json({ error: 'Unknown action' }, { status: 400 })
  }
}
