import { v4 as uuid } from 'uuid'
import { runBuilderLoop } from '@/lib/builder/agent-loop'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes max for the API route

export async function POST(req: Request) {
  const { buildId: providedBuildId, description } = await req.json()

  if (!description || typeof description !== 'string') {
    return Response.json({ error: 'description is required' }, { status: 400 })
  }

  const buildId = providedBuildId ?? uuid()

  // Fire and forget — the builder runs in the background.
  // Results are communicated via the builder_queue table.
  runBuilderLoop({ buildId, description }).catch((err) => {
    console.error('Builder loop failed:', err)
  })

  // Return immediately with the buildId so the frontend can subscribe to SSE
  return Response.json({ buildId })
}
