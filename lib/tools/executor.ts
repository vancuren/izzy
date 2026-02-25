import type { ToolContext } from '@/lib/capabilities/types'
import { BUILT_IN_TOOLS } from './built-in-tools'

/**
 * Execute a tool call by name. Dispatches to built-in handler
 * or to the capability execution path (for cap_ prefixed tools).
 */
export async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  // Check built-in tools first
  const builtIn = BUILT_IN_TOOLS.find((t) => t.definition.name === name)
  if (builtIn) {
    return builtIn.handler(input, ctx)
  }

  // Check if this is a catalog capability (prefixed with cap_)
  if (name.startsWith('cap_')) {
    const capName = name.slice(4) // Remove "cap_" prefix
    // Delegate to the execute_capability built-in tool handler
    const execTool = BUILT_IN_TOOLS.find((t) => t.definition.name === 'execute_capability')
    if (execTool) {
      return execTool.handler({ name: capName, input }, ctx)
    }
  }

  throw new Error(`Unknown tool: ${name}`)
}
