import { setSecret } from '@/lib/capabilities/secrets'
import { pushMessage } from '@/lib/queue/builder-queue'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { capabilityId, buildId, name, value } = body

    if (!capabilityId || !name || !value) {
      return Response.json(
        { error: 'capabilityId, name, and value are required' },
        { status: 400 },
      )
    }

    // Encrypt and store
    setSecret(capabilityId, name, value)

    // If buildId provided, notify the builder that the secret was saved
    if (buildId) {
      pushMessage(buildId, 'to_builder', 'answer', {
        answer: `Secret "${name}" saved successfully.`,
      })
    }

    return Response.json({ success: true, name })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to save secret' },
      { status: 500 },
    )
  }
}
