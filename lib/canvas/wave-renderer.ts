import { AgentState, WaveConfig, DARK_CONFIG } from './types'

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}

export class WaveRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private config: WaveConfig
  private time = 0
  private animationId = 0
  private audioLevel = 0
  private state: AgentState = 'idle'
  private faceTransition = 0 // 0 = waves, 1 = face

  constructor(canvas: HTMLCanvasElement, config?: WaveConfig) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.config = config ?? DARK_CONFIG
  }

  setConfig(config: WaveConfig) {
    this.config = config
  }

  setState(state: AgentState) {
    this.state = state
  }

  setAudioLevel(level: number) {
    this.audioLevel = Math.min(1, Math.max(0, level))
  }

  start() {
    const loop = () => {
      this.render()
      this.animationId = requestAnimationFrame(loop)
    }
    loop()
  }

  stop() {
    cancelAnimationFrame(this.animationId)
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.ctx.scale(dpr, dpr)
  }

  private render() {
    const rect = this.canvas.getBoundingClientRect()
    if (this.canvas.width !== rect.width * (window.devicePixelRatio || 1)) {
      this.resize()
    }

    const w = rect.width
    const h = rect.height
    const { lineCount, baseAmplitude, baseFrequency, baseSpeed, colors, backgroundColor } = this.config

    // Update time
    const speedMultiplier = this.state === 'listening' ? 1.5 + this.audioLevel * 2 :
                            this.state === 'thinking' ? 2.5 :
                            this.state === 'speaking' ? 1.2 :
                            1.0
    this.time += baseSpeed * speedMultiplier

    // Transition face morph
    const targetFace = this.state === 'speaking' ? 1 : 0
    this.faceTransition += (targetFace - this.faceTransition) * 0.03

    // Clear
    this.ctx.fillStyle = backgroundColor
    this.ctx.fillRect(0, 0, w, h)

    // Parse colors
    const startRgb = hexToRgb(colors.start)
    const midRgb = hexToRgb(colors.mid)
    const endRgb = hexToRgb(colors.end)

    // Draw lines
    for (let i = 0; i < lineCount; i++) {
      const t = i / (lineCount - 1)
      const color = t < 0.5
        ? lerpColor(startRgb, midRgb, t * 2)
        : lerpColor(midRgb, endRgb, (t - 0.5) * 2)

      this.ctx.strokeStyle = color
      this.ctx.lineWidth = 1.5
      this.ctx.globalAlpha = 0.6 + t * 0.4
      this.ctx.beginPath()

      const yBase = h * 0.3 + (h * 0.5) * t
      const amplitudeMultiplier =
        this.state === 'listening' ? 1.0 + this.audioLevel * 1.5 :
        this.state === 'thinking' ? 0.5 + Math.sin(this.time * 3 + i * 0.5) * 0.3 :
        this.state === 'speaking' ? 0.8 + this.audioLevel * 0.5 :
        1.0

      for (let x = 0; x <= w; x += 2) {
        // Wave calculation
        let y = yBase
        const wave1 = Math.sin(x * baseFrequency + this.time + i * 0.3) * baseAmplitude * amplitudeMultiplier
        const wave2 = Math.sin(x * baseFrequency * 0.5 + this.time * 0.7 + i * 0.5) * baseAmplitude * 0.5 * amplitudeMultiplier
        const waveY = y + wave1 + wave2

        // Face morph offset
        let faceOffset = 0
        if (this.faceTransition > 0.01) {
          const cx = w * 0.5
          const cy = h * 0.45
          const dx = (x - cx) / (w * 0.3)
          const dy = (yBase - cy) / (h * 0.3)
          const dist = Math.sqrt(dx * dx + dy * dy)

          // Left eye void
          const leftEyeX = -0.35
          const leftEyeY = -0.15
          const leftDist = Math.sqrt((dx - leftEyeX) ** 2 + (dy - leftEyeY) ** 2)
          if (leftDist < 0.25) {
            faceOffset -= (0.25 - leftDist) * 80 * this.faceTransition
          }

          // Right eye void
          const rightEyeX = 0.35
          const rightEyeY = -0.15
          const rightDist = Math.sqrt((dx - rightEyeX) ** 2 + (dy - rightEyeY) ** 2)
          if (rightDist < 0.25) {
            faceOffset -= (0.25 - rightDist) * 80 * this.faceTransition
          }

          // Jaw/mouth
          const mouthY = 0.35 + this.audioLevel * 0.15
          const mouthDist = Math.sqrt(dx * dx + (dy - mouthY) ** 2)
          if (mouthDist < 0.2) {
            const openAmount = this.state === 'speaking' ? this.audioLevel * 0.8 + 0.2 : 0.1
            faceOffset += (0.2 - mouthDist) * 60 * openAmount * this.faceTransition
          }

          // Overall face contour pull
          if (dist < 1.2) {
            const pull = (1.2 - dist) * 15 * this.faceTransition
            faceOffset += (dy < 0 ? -pull : pull) * 0.3
          }
        }

        y = waveY + faceOffset

        if (x === 0) {
          this.ctx.moveTo(x, y)
        } else {
          this.ctx.lineTo(x, y)
        }
      }

      this.ctx.stroke()
    }

    this.ctx.globalAlpha = 1
  }
}
