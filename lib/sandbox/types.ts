export interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number
  error?: string
}

export interface CodeExecutionResult {
  text: string
  logs: { stdout: string[]; stderr: string[] }
  error?: { name: string; value: string; traceback: string }
}

export interface SandboxConfig {
  timeoutMs?: number
  execTimeoutMs?: number
}
