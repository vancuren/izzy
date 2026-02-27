# Technical Deep Dive: Tooling System & Deep Memory

This document covers the two core subsystems of IzzyClaude in implementation detail: the dynamic tooling pipeline and the memory architecture.

---

## Part 1: The Tooling System

### Overview

IzzyClaude's tooling system has three layers:

1. **Built-in tools** — Hardcoded primitives that are always available (web search, browser, memory, reasoning, capability management)
2. **Catalog capabilities** — User-specific tools built at runtime by the Builder subagent, stored on disk, registered in SQLite
3. **The agentic loop** — The orchestration layer that assembles tools, calls Claude, executes tool calls, and feeds results back

### Tool Registration & Assembly

At the start of every agentic loop invocation, `assembleTools()` (`lib/tools/registry.ts`) builds the complete tool list sent to Claude:

```typescript
export function assembleTools(ctx: ToolContext): AnthropicTool[] {
  const builtIn = BUILT_IN_TOOLS.map((t) => t.definition)
  const activeCapabilities = ctx.catalog.list({ status: 'active' })
  const capTools = activeCapabilities.map((c) => ctx.catalog.toAnthropicTool(c))
  return [...builtIn, ...capTools]
}
```

Built-in tools come first (stable, always present). Active catalog capabilities are appended with a `cap_` prefix to distinguish them from built-ins. The conversion to Anthropic tool format wraps the capability's stored input schema:

```typescript
export function capabilityToAnthropicTool(cap: Capability): AnthropicTool {
  return {
    name: `cap_${cap.name}`,
    description: `[Capability] ${cap.description}`,
    input_schema: {
      type: 'object',
      properties: (cap.input_schema.properties) ?? {},
      required: (cap.input_schema.required) ?? [],
    },
  }
}
```

### Tool Dispatch

When Claude returns a `tool_use` block, the executor (`lib/tools/executor.ts`) routes it:

```typescript
export async function executeToolCall(name, input, ctx) {
  // 1. Check built-in tools by name
  const builtIn = BUILT_IN_TOOLS.find((t) => t.definition.name === name)
  if (builtIn) return builtIn.handler(input, ctx)

  // 2. Check catalog capabilities by cap_ prefix
  if (name.startsWith('cap_')) {
    const capName = name.slice(4)
    // Delegates to execute_capability handler
    return execTool.handler({ name: capName, input }, ctx)
  }

  throw new Error(`Unknown tool: ${name}`)
}
```

The `cap_` prefix convention means:
- Claude sees catalog tools as first-class tools (it can call `cap_weather_lookup` directly)
- The executor strips the prefix and delegates to `execute_capability`, which handles sandbox execution
- No name collisions between built-in tools and user-created capabilities

### The Agentic Loop

`runAgenticLoop()` (`lib/tools/agentic-loop.ts`) is the core orchestration function. It runs for up to 10 rounds of Claude calls, processing tool_use blocks on each round.

```
Round N:
  1. Call Claude Sonnet 4 with system prompt + messages + assembled tools
  2. If stop_reason != 'tool_use' → extract text, return final result
  3. For each tool_use block in the response:
     a. Emit tool_start SSE event
     b. Execute the tool (built-in handler or sandbox)
     c. Emit tool_result SSE event
     d. Collect result into tool_results array
  4. Append assistant response + tool results to working messages
  5. Special cases:
     - ask_user → short-circuits the loop, returns pending question
     - request_capability → captures buildId for the caller to trigger the Builder
  6. Continue to round N+1
```

Key design decisions:
- **Working messages accumulate**: Tool results are appended as `user` role messages with `tool_result` content blocks, building a complete trace Claude can reference in later rounds.
- **SSE events during execution**: Each tool emits `tool_start` and `tool_result` events so the UI can show real-time activity. Individual tools can also emit `tool_progress` events mid-execution (deep memory shows search progress, web search shows result counts, etc.).
- **ask_user breaks the loop**: When Claude needs clarification, the loop returns immediately with the question. The client speaks it, collects the answer, and sends a new POST with the updated message history.
- **Max rounds safety**: After 10 rounds, the loop returns a fallback message. This prevents infinite tool-calling loops.

### ToolContext — Dependency Injection

Every tool handler receives a `ToolContext` (`lib/tools/context.ts`) that provides access to shared services without direct imports:

```typescript
{
  messages: Array<{ role, content }>  // Conversation history
  memory: {
    create:     createMemory,         // Store a new memory
    search:     searchMemories,       // Search by tier/tags
    getRelevant: getRelevantMemories, // Keyword-scored retrieval
  },
  catalog: {
    lookup:          getCapabilityByName,   // Find by exact name
    list:            listCapabilities,      // List by status filter
    create:          createCapability,      // Create catalog entry
    toAnthropicTool: capabilityToAnthropicTool,
  },
  onToolEvent?: (event) => void  // SSE event emitter (injected by loop)
}
```

This means tool handlers are testable in isolation — you can pass mock memory/catalog implementations without touching the database.

### SSE Event Stream

The chat API route (`app/api/chat/route.ts`) returns a `ReadableStream` with `text/event-stream` content type. Events are defined in `lib/tools/stream-types.ts`:

| Event | Shape | When |
|-------|-------|------|
| `tool_start` | `{ name, input }` | Before a tool executes |
| `tool_progress` | `{ name, data }` | During execution (tool-specific) |
| `tool_result` | `{ name, result, isError }` | After a tool completes |
| `response` | `{ text, buildId, pendingQuestion, toolCalls }` | Final response from the loop |

The client parses these in `use-agent.ts` to drive tool overlay components (showing search results, memory lookups, reasoning steps, and builder progress in real time).

---

## Part 2: The Capability Lifecycle

### Phase 1: Request

When Claude determines it needs a tool that doesn't exist, it calls `request_capability`:

```
Input: { name: "weather_lookup", description: "...", input_schema: {...} }
```

The handler:
1. Checks if a capability with that name already exists (dedup)
2. Creates a catalog entry in `building` status
3. Creates a directory at `data/capabilities/{uuid}/`
4. Returns `{ status: "building", capability_id: "..." }`

The agentic loop detects the `request_capability` result, extracts the `buildId`, and passes it back to the chat route, which triggers the Builder asynchronously.

### Phase 2: Build

`runBuilderLoop()` (`lib/builder/agent-loop.ts`) is a separate agentic loop dedicated to building:

- **Sandbox**: Fresh E2B sandbox with 10-minute lifetime
- **Model**: Claude Sonnet 4, max 4096 tokens
- **Max iterations**: 25 (more than the main loop because building involves write→test→fix cycles)
- **System prompt**: Defines the `def run(args: dict) -> str` convention, lists available tools, and provides guidelines

The Builder has 6 tools:

| Tool | Purpose |
|------|---------|
| `write_file` | Write files to the sandbox filesystem |
| `run_code` | Execute Python in the sandbox Jupyter kernel |
| `run_command` | Run shell commands (pip install, etc.) |
| `ask_user` | Ask the user a question (relayed through the SQLite queue) |
| `report_progress` | Push a progress update to the UI |
| `register_capability` | Finalize and save the capability |

**The build loop**:
```
1. Create sandbox
2. Send "Build the following capability: ..." to Claude
3. For up to 25 iterations:
   a. Claude writes code → write_file
   b. Claude tests code → run_code
   c. If tests fail → Claude reads error, fixes, retries
   d. If needs deps → run_command("pip install ...")
   e. If needs user input → ask_user (polls SQLite queue for answer)
   f. When ready → register_capability with final files
4. On register_capability:
   - Update catalog metadata (description, input_schema, tags)
   - Save four files to data/capabilities/{uuid}/
   - Set status to 'active'
   - Push 'complete' message to queue
5. Cleanup sandbox
```

### Phase 3: Registration (The Four Files)

When the Builder calls `register_capability`, four files are saved:

**`main.py`** — The tool implementation. Must export:
```python
def run(args: dict) -> str:
    """
    args: dictionary of input parameters
    Returns: string result that will be spoken to the user
    """
```

**`requirements.txt`** — Python dependencies. The Builder is prompted to keep these minimal and avoid paid services unless the user requests them.

**`manifest.json`** — Structured metadata:
```json
{
  "name": "weather_lookup",
  "description": "Look up current weather for a city",
  "version": 2,
  "input_schema": {
    "type": "object",
    "properties": {
      "city": { "type": "string" }
    },
    "required": ["city"]
  },
  "created_at": "2025-02-14T...",
  "updated_at": "2025-02-14T..."
}
```

**`RUN.md`** — Auto-generated usage documentation:
```markdown
# weather_lookup

Look up current weather for a city using the Open-Meteo API.

## Usage
This capability is called automatically by Izzy when relevant.

## Input
\```json
{
  "type": "object",
  "properties": {
    "city": { "type": "string", "description": "City name" }
  },
  "required": ["city"]
}
\```
```

### The RUN.md Pattern

This is the mechanism that allows IzzyClaude to scale to an unbounded number of tools without context bloat.

**Without RUN.md**: Every tool's full documentation would need to be in the system prompt or tool description. With 50+ capabilities, this would consume thousands of tokens on every call, most of them irrelevant.

**With RUN.md**: The system prompt contains only a one-line summary per capability (`- weather_lookup: Look up current weather for a city`). The agent uses `lookup_capability` to get the input schema when it thinks a tool might be useful. If it needs deeper understanding of how to use the tool — edge cases, parameter details, expected output format — it can read the RUN.md. This is a **localized, on-demand prompt injection**: the documentation enters the context only when it's actually needed.

The flow in practice:
```
1. System prompt includes: "- weather_lookup: Look up current weather"
2. User says "What's the weather in Austin?"
3. Claude recognizes the tool might help
4. Claude calls lookup_capability("weather_lookup")
   → Returns: id, name, description, status, input_schema
5. Claude now knows the input format, calls cap_weather_lookup({ city: "Austin" })
6. Executor sandbox runs main.py with args
7. Result spoken to user
```

The RUN.md would only be needed if the tool had complex usage patterns (e.g., "pass coordinates as lat,lon string" or "returns Celsius by default, pass units='imperial' for Fahrenheit").

### Phase 4: Execution

`executeCapability()` (`lib/capabilities/executor.ts`) runs a stored capability:

```
1. Look up capability by ID → verify status is 'active'
2. Create fresh E2B sandbox (3 min lifetime)
3. Load main.py + requirements.txt from disk
4. Write files into sandbox
5. Install pip requirements (if any)
6. Run wrapper code:
   import json, sys
   sys.path.insert(0, '/home/user')
   from main import run
   _args = json.loads('{"city": "Austin"}')
   _result = run(_args)
   print("__RESULT__")
   print(str(_result))
7. Parse stdout — extract everything after __RESULT__ marker
8. Return result string
9. Destroy sandbox
```

The `__RESULT__` marker separates the tool's actual return value from any debug output, print statements, or pip install noise that might appear in stdout.

Every execution gets a fresh sandbox — no state carries over between invocations. This means:
- No side effects between runs
- No risk of one capability corrupting another
- Failed executions don't pollute future ones
- Network access is available but scoped to the sandbox lifetime

### Capability Catalog (SQLite)

The `capabilities` table:

```sql
CREATE TABLE capabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK(status IN ('building', 'active', 'failed', 'disabled')),
  input_schema TEXT NOT NULL DEFAULT '{}',
  output_schema TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '[]',
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Status lifecycle: `building` → `active` (success) or `failed` (build error). Active capabilities can be `disabled` manually.

Search is keyword-based against name and description with a configurable limit:
```sql
SELECT * FROM capabilities
WHERE status = 'active' AND (name LIKE ? OR description LIKE ?)
ORDER BY name LIMIT ?
```

### Builder Progress Queue

The Builder runs asynchronously. Communication between the Builder subagent and the client happens through a SQLite message queue (`lib/queue/builder-queue.ts`):

```sql
CREATE TABLE builder_queue (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('to_user', 'to_builder')),
  msg_type TEXT NOT NULL CHECK(msg_type IN ('question', 'answer', 'progress', 'complete', 'error')),
  payload TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
```

**to_user messages**: Builder → Client (progress updates, completion, errors, questions)
**to_builder messages**: Client → Builder (answers to questions)

The client subscribes via SSE at `/api/builder/status?buildId=` which polls the queue and streams messages as they appear. When the Builder calls `ask_user`, it pushes a `question` message to the queue and polls for an `answer` message (with 60-second timeout).

---

## Part 3: Deep Memory

### Memory Schema

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('short_term', 'long_term')),
  tags TEXT NOT NULL DEFAULT '[]',           -- JSON array of strings
  priority REAL NOT NULL DEFAULT 0.5,        -- 0.0 to 1.0
  embedding BLOB,                            -- Reserved for future vector search
  created_at INTEGER NOT NULL,
  last_accessed INTEGER NOT NULL,
  decay_rate REAL NOT NULL DEFAULT 0.01
);

CREATE TABLE memory_edges (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (source_id, target_id, relation),
  FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
);
```

### Memory Tiers & Decay

Memories have two tiers with different decay rates:

| Tier | Default Decay Rate | Default Priority | Purpose |
|------|--------------------|-----------------|---------|
| `short_term` | 0.02 per cycle | 0.5–0.6 | Transient facts, recent context |
| `long_term` | 0.005 per cycle | 0.8–0.9 | Important persistent facts |

**Decay** runs at the start of every chat request:
```sql
UPDATE memories SET priority = MAX(0, priority - decay_rate) WHERE priority > 0
```

This means:
- Short-term memories lose relevance quickly (~50 cycles to reach near-zero)
- Long-term memories persist much longer (~160 cycles)
- Memories with priority below 0.05 are excluded from search results
- Accessing a memory updates its `last_accessed` timestamp, which factors into scoring

### Memory Creation

Memories enter the system through two paths:

**Explicit storage** — Claude calls `store_memory` when it recognizes something important:
```json
{ "content": "User is allergic to shellfish", "tags": ["health", "allergy", "food"], "tier": "long_term" }
```

**Async extraction** — After every conversation exchange, the chat route fires off a background Claude call:
```
System: "Based on this conversation exchange, identify any facts, preferences, or important
         information worth remembering about the user. Return a JSON array..."

User: "user: I just moved to Austin from Portland
       assistant: Welcome to Austin! That's a big move..."

Response: [
  { "content": "User recently moved to Austin from Portland", "tags": ["location", "austin", "portland"], "tier": "long_term" },
  { "content": "User is new to Austin area", "tags": ["location", "austin"], "tier": "short_term" }
]
```

This is fire-and-forget — extraction failures are silently caught. The model used for extraction is Sonnet 4, same as the main loop.

### Memory Retrieval

There are three retrieval mechanisms, each suited to different access patterns:

**1. `recall_memory` (keyword search)**

Simple tag/keyword-based search. Used when Claude wants to look up specific facts:
```
Input: { keywords: ["food", "allergy"] }
```

Queries all memories above the 0.05 priority floor, optionally filtered by tier and tags, returns top N by priority.

**2. `getRelevantMemories` (scored retrieval)**

Used automatically at the start of every chat request. Extracts keywords from the last 3 messages and scores all memories:

```typescript
let score = row.priority                                   // Base priority

for (const kw of keywords) {
  if (tags.some((t) => t.includes(kw))) score += 0.3      // Tag match
  if (content.includes(kw))             score += 0.2      // Content match
}

const ageHours = (Date.now() - row.last_accessed) / (1000 * 60 * 60)
score += Math.max(0, 1 - ageHours / 24) * 0.2             // Recency boost (decays over 24h)
```

Scoring breakdown:
- **Base priority** (0.0–1.0): Reflects tier and decay state
- **Tag match** (+0.3 per keyword): Tags are the primary retrieval signal
- **Content match** (+0.2 per keyword): Direct substring match in memory content
- **Recency boost** (up to +0.2): Memories accessed in the last 24 hours get a boost that linearly decays to 0

Top 5 results are injected into the system prompt:
```
Things you remember about the user:
- User recently moved to Austin from Portland
- User is allergic to shellfish
- User prefers dark mode interfaces
```

**3. `deep_memory` (LLM-augmented search)**

This is the most sophisticated retrieval mechanism. It uses Claude to expand the query into multiple search angles, runs parallel searches, deduplicates, and synthesizes results.

The three-step pipeline:

**Step 1 — Query Expansion** (Claude Haiku 4.5):
```
System: "Generate 3-5 sets of search keywords to find relevant memories
         about a user query. Return ONLY a JSON array of arrays of strings."

User: "What does the user like to eat?"

Response: [
  ["food", "preference", "favorite"],
  ["restaurant", "cuisine", "dinner"],
  ["cooking", "recipe", "meal"],
  ["diet", "allergy", "restriction"]
]
```

This uses Haiku for speed — query expansion is a simple task that doesn't need Sonnet.

**Step 2 — Parallel Search**:

Each keyword set from Step 1 runs through `getRelevantMemories()` independently. Results are deduplicated by memory ID, sorted by priority, and capped at 10.

```typescript
const allResults = await Promise.all(
  keywordSets.map((keywords) => ctx.memory.getRelevant(keywords, 5))
)

// Deduplicate by id, sort by priority, take top 10
const seen = new Set<string>()
const uniqueMemories = allResults.flat()
  .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
  .sort((a, b) => b.priority - a.priority)
  .slice(0, 10)
```

This multi-angle search finds memories that a single keyword set would miss. If the user asks "what do I like to eat?", a simple search for "eat" might miss a memory tagged with "cuisine" or "restaurant" — but the expanded keyword sets catch it.

**Step 3 — Synthesis** (Claude Haiku 4.5):
```
System: "You are summarizing memories about a user. Synthesize the following
         memory fragments into a coherent, concise summary relevant to the query."

User: "Query: What does the user like to eat?

       Memories:
       - [long_term] User is allergic to shellfish (tags: health, allergy, food)
       - [long_term] User loves Thai food (tags: food, preference, cuisine)
       - [short_term] User had pasta for dinner last night (tags: food, dinner)"

Response: "The user loves Thai food and had pasta for dinner recently.
           Important note: they have a shellfish allergy."
```

The synthesis step turns fragmented memory entries into a coherent narrative the main agent can use directly.

**Progress events** are emitted at each step so the UI can show the deep memory search happening in real time:
1. `{ status: 'expanding', query }` — Generating search angles
2. `{ status: 'searching', searches: keywordSets }` — Running parallel searches
3. `{ status: 'found', count, memories }` — Results found, synthesizing

### Memory Graph

The `MemoryGraph` class (`lib/memory/graph.ts`) supports relationship-based traversal via BFS:

```typescript
class MemoryGraph {
  loadFromDb()                                    // Load all edges from SQLite
  getRelated(memoryId: string, depth = 2): string[] // BFS traversal up to depth N
}
```

Edges are stored in `memory_edges` with source, target, relation type, and weight. The graph enables queries like "find all memories related to this one within 2 hops." Edges are created via `addEdge()` in `store.ts`.

The `embedding BLOB` column in the memories table is reserved for future vector search — the current implementation uses keyword scoring, but the schema is ready for cosine similarity search when embeddings are added.

---

## Part 4: How It All Connects

Here's a complete trace of a request that triggers every subsystem:

```
User says: "What's the weather in Austin?"

1. Speech recognition captures transcript
2. Client sends POST /api/chat with message history

3. Chat route:
   a. decayMemories()                     — reduce all priorities by decay_rate
   b. Extract keywords: ["weather", "Austin"]
   c. getRelevantMemories(["weather", "Austin"])
      → Finds: "User recently moved to Austin from Portland" (tag match on "Austin")
   d. listCapabilities({ status: 'active' })
      → No weather tool exists yet
   e. Build system prompt with memory context
   f. Call runAgenticLoop()

4. Agentic loop round 1:
   a. Claude sees the request, no weather tool available
   b. Claude calls lookup_capability("weather")
      → { found: false }

5. Agentic loop round 2:
   c. Claude calls request_capability("weather_lookup", "Look up weather by city using Open-Meteo API", ...)
      → Creates catalog entry (status: building)
      → Returns { status: "building", capability_id: "abc-123" }
   d. Claude responds: "I'm building a weather tool for you — give me just a moment!"
   e. Loop returns with buildId = "abc-123"

6. Chat route (post-loop):
   a. Detects buildId → triggers Builder asynchronously
   b. Fires async memory extraction (learns "user asks about weather in Austin")
   c. Streams SSE response to client

7. Builder (running in parallel):
   a. Creates 10-min E2B sandbox
   b. Writes main.py with Open-Meteo API call
   c. Tests: run_code → verifies it returns weather data
   d. Installs requests library
   e. Calls register_capability with final files
   f. Saves main.py, requirements.txt, manifest.json, RUN.md
   g. Sets status to 'active'
   h. Pushes 'complete' to queue

8. Client receives builder completion via SSE
   → UI shows "weather_lookup is ready!"

9. Next request: "How about tomorrow's forecast?"
   a. Agentic loop assembles tools — cap_weather_lookup is now in the list
   b. Claude calls cap_weather_lookup({ city: "Austin" })
   c. Executor creates 3-min sandbox, installs deps, runs main.py
   d. Returns forecast string
   e. Claude speaks the result
```

Every subsequent weather request reuses the stored capability — no rebuilding, no wasted sandbox time. The tool persists across sessions because it's on disk and in SQLite.
