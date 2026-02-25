import type { AnthropicTool, ToolContext } from '@/lib/capabilities/types'
import { BUILT_IN_TOOLS } from './built-in-tools'

/**
 * Assemble the complete list of tools to send to Claude.
 * Called at the start of each agentic loop invocation.
 *
 * Order: built-in tools first, then active catalog capabilities.
 */
export function assembleTools(ctx: ToolContext): AnthropicTool[] {
  // 1. Built-in tools (always present)
  const builtIn = BUILT_IN_TOOLS.map((t) => t.definition)

  // 2. Active capabilities from catalog, converted to Anthropic tool format
  const activeCapabilities = ctx.catalog.list({ status: 'active' })
  const capTools = activeCapabilities.map((c) => ctx.catalog.toAnthropicTool(c))

  return [...builtIn, ...capTools]
}
