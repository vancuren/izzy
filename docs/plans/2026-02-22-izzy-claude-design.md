# IzzyClaude — Design Document

**Date:** 2026-02-22
**Status:** Approved

## Overview

A Next.js app that presents an always-on AI voice agent with a world-class abstract visualization UI. The agent listens via microphone, responds via speech synthesis, and proactively re-engages after idle periods. Conversations persist in a tiered memory system.

## Decisions

- **Architecture:** Monolithic Next.js (Approach A) — single app, API routes for backend
- **LLM:** Anthropic Claude via `@anthropic-ai/sdk`
- **Speech Input:** Web Speech API (`webkitSpeechRecognition`)
- **Speech Output:** Web Speech Synthesis API
- **Rendering:** HTML Canvas 2D for visualization
- **Database:** SQLite via `better-sqlite3`

## UI/UX Visualization

Full-bleed canvas with ~30 parallel wavy sine lines. Color palette: magenta → violet → blue on dark navy.

### 4 Visual States

| State | Behavior |
|-------|----------|
| Idle | Gentle sine oscillation, calm breathing |
| Listening | Lines pulse with mic amplitude via Web Audio AnalyserNode |
| Speaking | Lines morph into abstract face silhouette (eye voids + jaw arc synced to TTS) |
| Thinking | Lines tighten and swirl inward |

### Color System

- Dark: `#0a0a1a` bg, lines `#ff2d78` → `#7b2ff7` → `#2d5bff`
- Light: `#f8f6ff` bg, lines `#c41e5c` → `#5a1fb8` → `#1e3fcc`
- Responds to `prefers-color-scheme`

## Agent Loop

Client-side state machine: IDLE → LISTENING → THINKING → SPEAKING → IDLE.

- PROMPTING state when idle timer exceeds `IDLE_TIMEOUT_MS` (env, default 5 min)
- Claude generates dynamic re-engagement nudges based on conversation context
- Mic paused during SPEAKING to prevent feedback
- Mic audio levels feed canvas via AudioContext + AnalyserNode

## Memory System

### Three Tiers

- **Current Context:** Active conversation window (last N messages)
- **Short-term:** Session-detected topics/preferences, decays over hours/days
- **Long-term:** Confirmed patterns/facts, persistent, high priority

### SQLite Schema

- `memories` table: id, content, tier, tags (JSON), priority (0-1, decaying), embedding (BLOB stub), timestamps, decay_rate
- `memory_edges` table: source_id, target_id, relation, weight

### Graph

In-memory adjacency list from memory_edges. Enables related-memory walking and priority decay.

### Vector Search

Stubbed — embedding column exists, search is tag-based + recency for now.

### Context Assembly

Before each Claude call: take current context → extract keywords → query memories by tag + recency + priority → inject top-K into system prompt.
