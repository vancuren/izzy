import type Anthropic from '@anthropic-ai/sdk'
import type { Sandbox } from '@e2b/code-interpreter'
import { pushMessage, pollMessages } from '@/lib/queue/builder-queue'
import {
  getCapabilityByName,
  updateCapability,
  setCapabilityStatus,
  saveCapabilityFiles,
} from '@/lib/capabilities/catalog'
import { writeSandboxFiles, runPythonCode, runCommand } from '@/lib/sandbox/e2b-client'

export const BUILDER_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'write_file',
    description: 'Write a file to the sandbox filesystem. Use this to create main.py, requirements.txt, or any helper files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path in the sandbox (e.g., /home/user/main.py)' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_code',
    description: 'Execute Python code in the sandbox Jupyter kernel. Use this to test your code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'Python code to execute' },
      },
      required: ['code'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the sandbox. Use this for pip install, ls, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Shell command to run' },
      },
      required: ['command'],
    },
  },
  {
    name: 'ask_user',
    description: 'Ask the user a clarifying question. The question will be relayed through the main agent. Use sparingly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'The question to ask the user' },
      },
      required: ['question'],
    },
  },
  {
    name: 'request_secret',
    description: 'Request a secret or API key from the user. This shows a secure paste input in the UI instead of asking via voice. Use this for API keys, tokens, passwords, or any sensitive credentials.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Secret name in UPPER_SNAKE_CASE (e.g., "OPENWEATHER_API_KEY")' },
        description: { type: 'string', description: 'What this secret is for, so the user knows what to paste' },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'report_progress',
    description: 'Report build progress to the user. Call this at key milestones.',
    input_schema: {
      type: 'object' as const,
      properties: {
        step: { type: 'string', description: 'Current step name (e.g., "Writing code", "Testing", "Installing dependencies")' },
        detail: { type: 'string', description: 'Optional detail about what is happening' },
      },
      required: ['step'],
    },
  },
  {
    name: 'register_capability',
    description: 'Finalize and register the capability. Call this only after testing succeeds. Provide the final versions of all files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Capability name (snake_case, e.g., "weather_lookup")' },
        description: { type: 'string', description: 'What this capability does (1-2 sentences)' },
        main_py: { type: 'string', description: 'Final main.py content' },
        requirements_txt: { type: 'string', description: 'Final requirements.txt content (empty string if none)' },
        input_schema: {
          type: 'object',
          description: 'JSON schema for the input args',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for discoverability',
        },
        required_secrets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name', 'description'],
          },
          description: 'List of secrets this capability requires',
        },
      },
      required: ['name', 'description', 'main_py', 'requirements_txt', 'input_schema'],
    },
  },
]

export interface BuilderToolContext {
  sandbox: Sandbox
  buildId: string
  capabilityId?: string
  catalogCapabilityId?: string
}

export async function handleBuilderToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: BuilderToolContext,
): Promise<string> {
  switch (toolName) {
    case 'write_file': {
      await writeSandboxFiles(ctx.sandbox, [
        { path: toolInput.path as string, content: toolInput.content as string },
      ])
      return `File written to ${toolInput.path}`
    }

    case 'run_code': {
      const result = await runPythonCode(ctx.sandbox, toolInput.code as string, { timeoutMs: 30_000 })
      if (result.error) {
        return `Error: ${result.error.name}: ${result.error.value}\n${result.error.traceback}`
      }
      const stdout = result.logs.stdout.join('\n')
      const stderr = result.logs.stderr.join('\n')
      return `Output: ${result.text}\nStdout: ${stdout}${stderr ? `\nStderr: ${stderr}` : ''}`
    }

    case 'run_command': {
      const result = await runCommand(ctx.sandbox, toolInput.command as string, { timeoutMs: 120_000 })
      return `Exit code: ${result.exitCode}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`
    }

    case 'ask_user': {
      pushMessage(ctx.buildId, 'to_user', 'question', { question: toolInput.question as string })
      const answer = await waitForAnswer(ctx.buildId, 60_000)
      return answer ?? 'No answer received from user (timed out).'
    }

    case 'request_secret': {
      const name = toolInput.name as string
      const description = toolInput.description as string
      pushMessage(ctx.buildId, 'to_user', 'secret_request', {
        name,
        description,
        capabilityId: ctx.catalogCapabilityId,
      })
      const response = await waitForAnswer(ctx.buildId, 120_000)
      if (response) {
        return `Secret "${name}" has been saved by the user. Access it in your code via context['secrets']['${name}'].`
      }
      return `User did not provide the secret "${name}" within the timeout.`
    }

    case 'report_progress': {
      pushMessage(ctx.buildId, 'to_user', 'progress', {
        step: toolInput.step as string,
        detail: (toolInput.detail as string) ?? '',
      })
      return 'Progress reported.'
    }

    case 'register_capability': {
      const capName = toolInput.name as string

      // Look up the existing catalog entry created by request_capability
      const cap = getCapabilityByName(capName)
      if (!cap) {
        throw new Error(`Capability "${capName}" not found in catalog. Was request_capability called first?`)
      }

      // Update the catalog entry with final metadata from the builder
      updateCapability(cap.id, {
        description: toolInput.description as string,
        input_schema: toolInput.input_schema as Record<string, unknown>,
        tags: (toolInput.tags as string[]) ?? cap.tags,
      })

      const manifest = {
        name: capName,
        description: toolInput.description,
        version: cap.version + 1,
        input_schema: toolInput.input_schema,
        required_secrets: (toolInput.required_secrets as Array<{ name: string; description: string }>) ?? [],
        created_at: new Date(cap.created_at).toISOString(),
        updated_at: new Date().toISOString(),
      }

      const runMd = [
        `# ${capName}`,
        '',
        toolInput.description as string,
        '',
        '## Usage',
        '',
        'This capability is called automatically by Izzy when relevant.',
        '',
        '## Input',
        '',
        '```json',
        JSON.stringify(toolInput.input_schema, null, 2),
        '```',
      ].join('\n')

      saveCapabilityFiles(cap.id, {
        mainPy: toolInput.main_py as string,
        requirementsTxt: toolInput.requirements_txt as string,
        manifestJson: JSON.stringify(manifest, null, 2),
        runMd,
      })

      setCapabilityStatus(cap.id, 'active')
      ctx.capabilityId = cap.id

      pushMessage(ctx.buildId, 'to_user', 'complete', {
        capability_id: cap.id,
        capability_name: capName,
        summary: toolInput.description as string,
      })

      return `Capability "${capName}" registered successfully with id ${cap.id}.`
    }

    default:
      return `Unknown tool: ${toolName}`
  }
}

async function waitForAnswer(buildId: string, timeoutMs: number): Promise<string | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const messages = pollMessages(buildId, 'to_builder')
    const answer = messages.find((m) => m.msg_type === 'answer')
    if (answer) {
      return (answer.payload as { answer: string }).answer
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return null
}
