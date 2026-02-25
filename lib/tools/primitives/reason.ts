import Anthropic from '@anthropic-ai/sdk'
import type { ToolContext } from '@/lib/capabilities/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const REASONING_SYSTEM = `You are a careful, step-by-step reasoning engine. When given a question or problem:

1. Break it down into numbered steps
2. Think through each step explicitly
3. Show your reasoning at each point
4. Arrive at a clear conclusion

Format your response as:
Step 1: [reasoning]
Step 2: [reasoning]
...
Conclusion: [final answer or recommendation]

Be thorough but concise. Each step should advance the reasoning meaningfully.`

export async function handleReason(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const question = input.question as string
  const context = (input.context as string) ?? ''
  const emit = ctx.onToolEvent

  emit?.({ type: 'tool_progress', name: 'reason', data: { status: 'thinking', question } })

  try {
    const userContent = context
      ? `Context: ${context}\n\nQuestion: ${question}`
      : question

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: REASONING_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    })

    const fullText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // Parse steps and conclusion
    const lines = fullText.split('\n').filter((l) => l.trim())
    const steps: Array<{ step: number; text: string }> = []
    let conclusion = ''

    for (const line of lines) {
      const stepMatch = line.match(/^Step\s+(\d+):\s*(.+)/i)
      const conclusionMatch = line.match(/^Conclusion:\s*(.+)/i)

      if (stepMatch) {
        const step = { step: parseInt(stepMatch[1], 10), text: stepMatch[2] }
        steps.push(step)
        emit?.({
          type: 'tool_progress',
          name: 'reason',
          data: { status: 'step', step: step.step, text: step.text },
        })
      } else if (conclusionMatch) {
        conclusion = conclusionMatch[1]
        emit?.({
          type: 'tool_progress',
          name: 'reason',
          data: { status: 'conclusion', text: conclusion },
        })
      }
    }

    return JSON.stringify({
      question,
      steps,
      conclusion,
      fullReasoning: fullText,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: true, message })
  }
}
