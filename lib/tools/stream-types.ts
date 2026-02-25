export type ToolStreamEvent =
  | { type: 'tool_start'; name: string; input: Record<string, unknown> }
  | { type: 'tool_progress'; name: string; data: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string; isError: boolean }
  | { type: 'response'; text: string; buildId: string | null }

/** Tool-only events (excludes response) — used by overlay components */
export type ToolEvent = Exclude<ToolStreamEvent, { type: 'response' }>
