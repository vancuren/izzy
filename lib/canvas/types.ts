export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'prompting'

export interface WaveConfig {
  lineCount: number
  baseAmplitude: number
  baseFrequency: number
  baseSpeed: number
  colors: {
    start: string
    mid: string
    end: string
  }
  backgroundColor: string
}

export const DARK_CONFIG: WaveConfig = {
  lineCount: 30,
  baseAmplitude: 40,
  baseFrequency: 0.008,
  baseSpeed: 0.015,
  colors: {
    start: '#ff2d78',
    mid: '#7b2ff7',
    end: '#2d5bff',
  },
  backgroundColor: '#0a0a1a',
}

export const LIGHT_CONFIG: WaveConfig = {
  lineCount: 30,
  baseAmplitude: 40,
  baseFrequency: 0.008,
  baseSpeed: 0.015,
  colors: {
    start: '#c41e5c',
    mid: '#5a1fb8',
    end: '#1e3fcc',
  },
  backgroundColor: '#f8f6ff',
}
