import { NextRequest, NextResponse } from 'next/server'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL'
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_turbo_v2_5'

export async function POST(request: NextRequest) {
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
  }

  const { text, voiceId } = await request.json()

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const vid = voiceId ?? VOICE_ID

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${vid}/stream?output_format=pcm_24000`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          speed: 1.0,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    return NextResponse.json(
      { error: `ElevenLabs API error: ${response.status} - ${errorText}` },
      { status: response.status }
    )
  }

  if (!response.body) {
    return NextResponse.json({ error: 'No response body from ElevenLabs' }, { status: 502 })
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Transfer-Encoding': 'chunked',
    },
  })
}
