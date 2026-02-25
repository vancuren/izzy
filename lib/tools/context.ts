import type { ToolContext } from '@/lib/capabilities/types'
import { createMemory, searchMemories, getRelevantMemories } from '@/lib/memory/store'
import {
  getCapabilityByName,
  listCapabilities,
  createCapability,
  capabilityToAnthropicTool,
} from '@/lib/capabilities/catalog'

/**
 * Factory function to create the ToolContext for a given request.
 */
export function createToolContext(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): ToolContext {
  return {
    messages,
    memory: {
      create: createMemory,
      search: searchMemories,
      getRelevant: getRelevantMemories,
    },
    catalog: {
      lookup: getCapabilityByName,
      list: listCapabilities,
      create: createCapability,
      toAnthropicTool: capabilityToAnthropicTool,
    },
  }
}
