import { pollMessages } from '@/lib/queue/builder-queue'

export const runtime = 'nodejs'

const SSE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export async function GET(req: Request) {
  const url = new URL(req.url)
  const buildId = url.searchParams.get('buildId')

  if (!buildId) {
    return Response.json({ error: 'buildId query parameter is required' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now()
      let done = false
      while (!done) {
        // Timeout: close the stream if the builder takes too long
        if (Date.now() - startTime > SSE_TIMEOUT_MS) {
          const timeout = JSON.stringify({ msg_type: 'error', payload: { error: 'Build timed out', recoverable: false } })
          controller.enqueue(encoder.encode(`data: ${timeout}\n\n`))
          done = true
          break
        }

        const messages = pollMessages(buildId, 'to_user')
        for (const msg of messages) {
          const data = JSON.stringify(msg)
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          if (msg.msg_type === 'complete' || msg.msg_type === 'error') {
            done = true
          }
        }
        if (!done) {
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
      controller.close()
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
