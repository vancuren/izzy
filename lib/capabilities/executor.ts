import type { Sandbox } from '@e2b/code-interpreter'
import { createSandbox, writeSandboxFiles, installRequirements, runPythonCode, destroySandbox } from '@/lib/sandbox/e2b-client'
import { getCapability, loadCapabilityFiles } from './catalog'

export interface ExecutionInput {
  capability_id: string
  args: Record<string, unknown>
}

export interface ExecutionOutput {
  success: boolean
  result?: string
  error?: string
  stdout?: string[]
  stderr?: string[]
}

export async function executeCapability(input: ExecutionInput): Promise<ExecutionOutput> {
  const cap = getCapability(input.capability_id)
  if (!cap) {
    return { success: false, error: `Capability ${input.capability_id} not found` }
  }
  if (cap.status !== 'active') {
    return { success: false, error: `Capability ${cap.name} is not active (status: ${cap.status})` }
  }

  let sbx: Sandbox | null = null

  try {
    // 1. Spin up sandbox (3 min lifetime for execution)
    sbx = await createSandbox({ timeoutMs: 180_000 })

    // 2. Load capability files from disk
    const files = loadCapabilityFiles(input.capability_id)

    // 3. Write files into sandbox
    await writeSandboxFiles(sbx, [
      { path: '/home/user/main.py', content: files.mainPy },
      { path: '/home/user/requirements.txt', content: files.requirementsTxt },
    ])

    // 4. Install requirements (skip if empty)
    const trimmedReqs = files.requirementsTxt.trim()
    if (trimmedReqs.length > 0) {
      const pipResult = await installRequirements(sbx, trimmedReqs)
      if (pipResult.exitCode !== 0) {
        return {
          success: false,
          error: `Failed to install requirements: ${pipResult.stderr}`,
          stderr: [pipResult.stderr],
        }
      }
    }

    // 5. Run the capability
    //    Convention: main.py defines `def run(args: dict) -> str`
    const argsJson = JSON.stringify(input.args)
    const wrapperCode = `
import json
import sys
sys.path.insert(0, '/home/user')
from main import run

_args = json.loads(${JSON.stringify(argsJson)})
_result = run(_args)
print("__RESULT__")
print(str(_result))
`

    const execution = await runPythonCode(sbx, wrapperCode, { timeoutMs: 60_000 })

    // 6. Parse output
    if (execution.error) {
      return {
        success: false,
        error: `${execution.error.name}: ${execution.error.value}`,
        stdout: execution.logs.stdout,
        stderr: execution.logs.stderr,
      }
    }

    // Extract result from stdout (everything after __RESULT__ marker)
    const allStdout = execution.logs.stdout.join('\n')
    const markerIndex = allStdout.indexOf('__RESULT__')
    const result = markerIndex >= 0
      ? allStdout.substring(markerIndex + '__RESULT__\n'.length).trim()
      : execution.text || allStdout

    return {
      success: true,
      result,
      stdout: execution.logs.stdout,
      stderr: execution.logs.stderr,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    // 7. Always cleanup
    if (sbx) {
      await destroySandbox(sbx)
    }
  }
}
