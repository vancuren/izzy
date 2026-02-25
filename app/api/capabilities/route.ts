import { listCapabilities, getCapability, getCapabilityByName } from '@/lib/capabilities/catalog'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const name = url.searchParams.get('name')

  if (id) {
    const cap = getCapability(id)
    return cap
      ? Response.json({ capability: cap })
      : Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (name) {
    const cap = getCapabilityByName(name)
    return cap
      ? Response.json({ capability: cap })
      : Response.json({ error: 'Not found' }, { status: 404 })
  }

  const all = listCapabilities()
  return Response.json({ capabilities: all })
}
