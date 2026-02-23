export function createSpeechRecognition(): SpeechRecognition | null {
  if (typeof window === 'undefined') return null
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) return null

  const recognition = new SpeechRecognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'en-US'
  return recognition
}

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    speechSynthesis.speak(utterance)
  })
}

export function createAudioAnalyser(): {
  analyser: AnalyserNode
  getLevel: () => number
  cleanup: () => void
} | null {
  if (typeof window === 'undefined') return null

  try {
    const audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
    })

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    return {
      analyser,
      getLevel: () => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        return sum / (dataArray.length * 255)
      },
      cleanup: () => {
        audioCtx.close()
      },
    }
  } catch {
    return null
  }
}
