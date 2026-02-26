/**
 * ElevenLabs streaming TTS with Web Speech API fallback.
 *
 * Audio flow:
 *   fetch /api/tts → ReadableStream of PCM (24kHz 16-bit mono)
 *     → StreamingAudioPlayer decodes chunks → Web Audio API playback
 *     → on error → speakWithWebSpeechAPI()
 */

const SAMPLE_RATE = 24000

class StreamingAudioPlayer {
  private ctx: AudioContext
  private nextStartTime = 0
  private sources: AudioBufferSourceNode[] = []
  private lastSource: AudioBufferSourceNode | null = null
  private endedResolve: (() => void) | null = null

  constructor() {
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
  }

  playChunk(pcmData: ArrayBuffer): void {
    const int16 = new Int16Array(pcmData)
    if (int16.length === 0) return

    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768
    }

    const buffer = this.ctx.createBuffer(1, float32.length, SAMPLE_RATE)
    buffer.getChannelData(0).set(float32)

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.ctx.destination)

    const startTime = Math.max(this.ctx.currentTime, this.nextStartTime)
    source.start(startTime)
    this.nextStartTime = startTime + buffer.duration

    this.sources.push(source)
    this.lastSource = source
  }

  /** Resolves when the last scheduled audio chunk finishes playing. */
  waitForEnd(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.lastSource) {
        resolve()
        return
      }
      this.endedResolve = resolve
      this.lastSource.onended = () => {
        this.endedResolve?.()
        this.endedResolve = null
      }
    })
  }

  stop(): void {
    for (const source of this.sources) {
      try { source.stop() } catch { /* already stopped */ }
    }
    this.sources = []
    this.lastSource = null
    this.nextStartTime = 0
    this.endedResolve?.()
    this.endedResolve = null
    this.ctx.close()
  }
}

async function speakWithElevenLabs(text: string): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const player = new StreamingAudioPlayer()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        // value is a Uint8Array of raw PCM bytes
        player.playChunk(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
      }
      await player.waitForEnd()
    } finally {
      player.stop()
    }
  } finally {
    clearTimeout(timeout)
  }
}

function speakWithWebSpeechAPI(text: string): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    speechSynthesis.speak(utterance)
  })
}

export async function speak(text: string): Promise<void> {
  if (!text.trim()) return

  try {
    await speakWithElevenLabs(text)
  } catch (err) {
    console.warn('ElevenLabs TTS failed, falling back to Web Speech API:', err)
    await speakWithWebSpeechAPI(text)
  }
}
