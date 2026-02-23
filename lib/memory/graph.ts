import { db } from './db'
import './schema'

interface GraphNode {
  id: string
  edges: Map<string, { relation: string; weight: number }>
}

export class MemoryGraph {
  private nodes: Map<string, GraphNode> = new Map()

  loadFromDb() {
    const edges = db.prepare('SELECT * FROM memory_edges').all() as any[]
    this.nodes.clear()

    for (const edge of edges) {
      if (!this.nodes.has(edge.source_id)) {
        this.nodes.set(edge.source_id, { id: edge.source_id, edges: new Map() })
      }
      if (!this.nodes.has(edge.target_id)) {
        this.nodes.set(edge.target_id, { id: edge.target_id, edges: new Map() })
      }
      this.nodes.get(edge.source_id)!.edges.set(edge.target_id, {
        relation: edge.relation,
        weight: edge.weight,
      })
    }
  }

  getRelated(memoryId: string, depth = 2): string[] {
    const visited = new Set<string>()
    const queue: Array<{ id: string; d: number }> = [{ id: memoryId, d: 0 }]

    while (queue.length > 0) {
      const { id, d } = queue.shift()!
      if (visited.has(id) || d > depth) continue
      visited.add(id)

      const node = this.nodes.get(id)
      if (node) {
        for (const [targetId] of node.edges) {
          if (!visited.has(targetId)) {
            queue.push({ id: targetId, d: d + 1 })
          }
        }
      }
    }

    visited.delete(memoryId)
    return Array.from(visited)
  }
}
