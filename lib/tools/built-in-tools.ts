import type { BuiltInToolDef } from '@/lib/capabilities/types'
import { executeCapability } from '@/lib/capabilities/executor'
import { handleWebSearch } from './primitives/web-search'
import { handleBrowserUse } from './primitives/browser-use'
import { handleDeepMemory } from './primitives/deep-memory'
import { handleReason } from './primitives/reason'

export const BUILT_IN_TOOLS: BuiltInToolDef[] = [

  // ─── lookup_capability ───────────────────────────────────
  {
    definition: {
      name: 'lookup_capability',
      description: 'Check if a capability exists in the catalog by name or keyword. Returns the capability metadata if found, or a message indicating it does not exist. Use this before trying to execute a capability to verify it exists.',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Exact name or search keyword for the capability',
          },
        },
        required: ['name'],
      },
    },
    handler: async (input, ctx) => {
      const name = input.name as string
      const exact = ctx.catalog.lookup(name)
      if (exact) {
        return JSON.stringify({
          found: true,
          capability: {
            id: exact.id,
            name: exact.name,
            description: exact.description,
            status: exact.status,
            input_schema: exact.input_schema,
          },
        })
      }
      // Fuzzy: check all active capabilities for substring match
      const all = ctx.catalog.list({ status: 'active' })
      const matches = all.filter(
        (c) =>
          c.name.toLowerCase().includes(name.toLowerCase()) ||
          c.description.toLowerCase().includes(name.toLowerCase()),
      )
      if (matches.length > 0) {
        return JSON.stringify({
          found: true,
          matches: matches.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
          })),
        })
      }
      return JSON.stringify({ found: false, message: `No capability matching "${name}" found.` })
    },
  },

  // ─── request_capability ──────────────────────────────────
  {
    definition: {
      name: 'request_capability',
      description: 'Request the creation of a new capability. This triggers the builder subagent to write Python code, test it in a sandbox, and register it to the catalog. Use this when the user asks for something that requires a new tool you do not have.',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Short, snake_case name for the capability (e.g., "send_email", "weather_lookup")',
          },
          description: {
            type: 'string',
            description: 'Detailed description of what the capability should do, including expected inputs and outputs',
          },
          input_schema: {
            type: 'object',
            description: 'JSON Schema describing the expected input parameters',
          },
        },
        required: ['name', 'description'],
      },
    },
    handler: async (input, ctx) => {
      const name = input.name as string
      const description = input.description as string
      const inputSchema = (input.input_schema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      }

      // Check if capability already exists
      const existing = ctx.catalog.lookup(name)
      if (existing) {
        return JSON.stringify({
          status: 'already_exists',
          capability_id: existing.id,
          message: `Capability "${name}" already exists with status: ${existing.status}`,
        })
      }

      // Create the catalog entry in 'building' status
      const cap = ctx.catalog.create({
        name,
        description,
        input_schema: inputSchema,
      })

      // The actual builder dispatch happens in the agentic loop after this tool returns.
      // We return the capability id and build metadata so the loop can trigger POST /api/builder.
      return JSON.stringify({
        status: 'building',
        capability_id: cap.id,
        capability_name: cap.name,
        message: `Capability "${name}" is being built. It will be available once the builder completes.`,
      })
    },
  },

  // ─── execute_capability ──────────────────────────────────
  {
    definition: {
      name: 'execute_capability',
      description: 'Execute an existing capability from the catalog by name or ID. The capability must have status "active". Provide the input parameters as a JSON object matching the capability\'s input_schema.',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Name of the capability to execute',
          },
          input: {
            type: 'object',
            description: 'Input parameters for the capability, matching its input_schema',
          },
        },
        required: ['name'],
      },
    },
    handler: async (input, ctx) => {
      const name = input.name as string
      const capInput = (input.input as Record<string, unknown>) ?? {}

      const cap = ctx.catalog.lookup(name)
      if (!cap) {
        throw new Error(`Capability "${name}" not found in catalog.`)
      }
      if (cap.status !== 'active') {
        throw new Error(`Capability "${name}" is not active (status: ${cap.status}).`)
      }

      const result = await executeCapability({
        capability_id: cap.id,
        args: capInput,
      })

      if (result.success) {
        return JSON.stringify({
          status: 'success',
          result: result.result,
        })
      } else {
        throw new Error(result.error ?? 'Capability execution failed')
      }
    },
  },

  // ─── ask_user ────────────────────────────────────────────
  {
    definition: {
      name: 'ask_user',
      description: 'Ask the user a clarifying question and wait for their spoken response. Use this when you need more information to fulfill a request. The question will be spoken aloud.',
      input_schema: {
        type: 'object' as const,
        properties: {
          question: {
            type: 'string',
            description: 'The question to ask the user (will be spoken aloud, keep it concise)',
          },
        },
        required: ['question'],
      },
    },
    handler: async (input) => {
      // The actual ask_user logic is handled in the agentic loop,
      // which short-circuits when it sees this tool name.
      // This handler is a fallback that should not normally execute.
      return JSON.stringify({ status: 'question_sent', question: input.question })
    },
  },

  // ─── store_memory ────────────────────────────────────────
  {
    definition: {
      name: 'store_memory',
      description: 'Explicitly store a piece of information about the user in memory. Use this when the user tells you something important they want you to remember, or when you identify a significant preference or fact.',
      input_schema: {
        type: 'object' as const,
        properties: {
          content: {
            type: 'string',
            description: 'The fact or information to remember',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keywords/tags for retrieval (e.g., ["preference", "food", "allergies"])',
          },
          tier: {
            type: 'string',
            enum: ['short_term', 'long_term'],
            description: 'Memory tier. Use long_term for important persistent facts.',
          },
        },
        required: ['content'],
      },
    },
    handler: async (input, ctx) => {
      const content = input.content as string
      const tags = (input.tags as string[]) ?? []
      const tier = (input.tier as 'short_term' | 'long_term') ?? 'long_term'

      const memory = ctx.memory.create({
        content,
        tags,
        tier,
        priority: tier === 'long_term' ? 0.9 : 0.6,
      })

      return JSON.stringify({
        stored: true,
        memory_id: memory.id,
        message: `Remembered: "${content}"`,
      })
    },
  },

  // ─── recall_memory ───────────────────────────────────────
  {
    definition: {
      name: 'recall_memory',
      description: 'Search memories by keywords or tags. Use this when you need to recall specific information about the user that may not be in the current conversation context.',
      input_schema: {
        type: 'object' as const,
        properties: {
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keywords to search for in memory content and tags',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of memories to return (default: 5)',
          },
        },
        required: ['keywords'],
      },
    },
    handler: async (input, ctx) => {
      const keywords = (input.keywords as string[]) ?? []
      const limit = (input.limit as number) ?? 5

      const memories = ctx.memory.getRelevant(keywords, limit)

      if (memories.length === 0) {
        return JSON.stringify({ found: false, message: 'No relevant memories found.' })
      }

      return JSON.stringify({
        found: true,
        memories: memories.map((m) => ({
          content: m.content,
          tier: m.tier,
          tags: m.tags,
          priority: m.priority,
        })),
      })
    },
  },

  // ─── web_search ──────────────────────────────────────────
  {
    definition: {
      name: 'web_search',
      description:
        'Search the web for current information. Use when the user asks about recent events, facts you are unsure about, or anything that benefits from live web data.',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: {
            type: 'number',
            description: 'Max results to return (default 5)',
          },
        },
        required: ['query'],
      },
    },
    handler: handleWebSearch,
  },

  // ─── browser_use ─────────────────────────────────────────
  {
    definition: {
      name: 'browser_use',
      description:
        'Browse to a URL and read its content. Use when the user asks you to read a webpage, article, or needs information from a specific URL.',
      input_schema: {
        type: 'object' as const,
        properties: {
          url: { type: 'string', description: 'URL to browse to' },
          extract: {
            type: 'string',
            enum: ['full', 'summary'],
            description: 'Extract full content or summary (default: summary)',
          },
        },
        required: ['url'],
      },
    },
    handler: handleBrowserUse,
  },

  // ─── deep_memory ─────────────────────────────────────────
  {
    definition: {
      name: 'deep_memory',
      description:
        'Perform a thorough search through your memories about the user. Use when you need to recall detailed information, connect related memories, or the user asks "do you remember..." about something specific.',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'What to search for in memory',
          },
        },
        required: ['query'],
      },
    },
    handler: handleDeepMemory,
  },

  // ─── reason ──────────────────────────────────────────────
  {
    definition: {
      name: 'reason',
      description:
        'Think through a complex question step by step before answering. Use for math, logic, planning, weighing options, or any question that benefits from careful reasoning rather than an immediate response.',
      input_schema: {
        type: 'object' as const,
        properties: {
          question: {
            type: 'string',
            description: 'The question or problem to reason about',
          },
          context: {
            type: 'string',
            description: 'Additional context from the conversation',
          },
        },
        required: ['question'],
      },
    },
    handler: handleReason,
  },
]
