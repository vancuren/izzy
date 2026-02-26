import type { Sandbox } from '@e2b/code-interpreter'
import { createSandbox, writeSandboxFiles, installRequirements, runPythonCode, destroySandbox } from '@/lib/sandbox/e2b-client'
import { getCapability, loadCapabilityFiles } from './catalog'
import { getSecrets } from './secrets'
import { getStorage, setStorage } from './storage'

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
    //    or the new signature `def run(args: dict, context: dict) -> str | dict`
    const argsJson = JSON.stringify(input.args)

    // Load secrets and storage for the capability
    const secrets = getSecrets(input.capability_id)
    const storage = getStorage(input.capability_id)
    const contextJson = JSON.stringify({ secrets, storage })

    const wrapperCode = `
import json
import sys
import inspect
sys.path.insert(0, '/home/user')
from main import run

_args = json.loads(${JSON.stringify(argsJson)})
_context = json.loads(${JSON.stringify(contextJson)})

# Support both old signature run(args) and new run(args, context)
_sig = inspect.signature(run)
if len(_sig.parameters) >= 2:
    _result = run(_args, _context)
else:
    _result = run(_args)

print("__RESULT__")
if isinstance(_result, dict):
    print(json.dumps(_result))
else:
    print(json.dumps({"response": str(_result)}))
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
    const rawResult = markerIndex >= 0
      ? allStdout.substring(markerIndex + '__RESULT__\n'.length).trim()
      : execution.text || allStdout

    // Parse structured result
    let result = rawResult
    try {
      const parsed = JSON.parse(rawResult)
      result = parsed.response ?? rawResult
      // Save storage updates if present
      if (parsed.storage && typeof parsed.storage === 'object' && !Array.isArray(parsed.storage)) {
        setStorage(input.capability_id, parsed.storage)
      }
    } catch {
      // Plain string result — backward compatible
    }

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
