import { Sandbox } from '@e2b/code-interpreter'
import type { SandboxResult, CodeExecutionResult, SandboxConfig } from './types'

const DEFAULT_TIMEOUT_MS = 300_000     // 5 min sandbox lifetime
const DEFAULT_EXEC_TIMEOUT_MS = 60_000 // 1 min per execution
const DEFAULT_PIP_TIMEOUT_MS = 120_000 // 2 min for pip install

export async function createSandbox(config?: SandboxConfig): Promise<Sandbox> {
  return Sandbox.create({
    timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })
}

export async function writeSandboxFiles(
  sbx: Sandbox,
  files: Array<{ path: string; content: string }>,
): Promise<void> {
  for (const f of files) {
    await sbx.files.write(f.path, f.content)
  }
}

export async function installRequirements(
  sbx: Sandbox,
  requirementsContent: string,
  timeoutMs?: number,
): Promise<SandboxResult> {
  await sbx.files.write('/home/user/requirements.txt', requirementsContent)

  const result = await sbx.commands.run('pip install -r /home/user/requirements.txt', {
    timeoutMs: timeoutMs ?? DEFAULT_PIP_TIMEOUT_MS,
    cwd: '/home/user',
  })

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  }
}

export async function runCommand(
  sbx: Sandbox,
  cmd: string,
  opts?: { cwd?: string; envs?: Record<string, string>; timeoutMs?: number },
): Promise<SandboxResult> {
  const result = await sbx.commands.run(cmd, {
    cwd: opts?.cwd ?? '/home/user',
    envs: opts?.envs,
    timeoutMs: opts?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
  })

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  }
}

export async function runPythonCode(
  sbx: Sandbox,
  code: string,
  opts?: { timeoutMs?: number },
): Promise<CodeExecutionResult> {
  const execution = await sbx.runCode(code, {
    timeoutMs: opts?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
  })

  return {
    text: execution.text ?? '',
    logs: execution.logs,
    error: execution.error
      ? {
          name: execution.error.name,
          value: execution.error.value,
          traceback: execution.error.traceback,
        }
      : undefined,
  }
}

export async function destroySandbox(sbx: Sandbox): Promise<void> {
  try {
    await sbx.kill()
  } catch {
    // Sandbox may already be terminated
  }
}
