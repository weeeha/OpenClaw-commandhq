import { NextResponse } from 'next/server'
import { promises as fs, existsSync } from 'fs'
import path from 'path'
import os from 'os'

export interface SubagentInfo {
  toolId: string
  label: string
}

export interface AgentActivity {
  agentId: string
  name: string
  emoji: string
  state: 'idle' | 'working' | 'waiting' | 'offline'
  currentTool?: string
  toolStatus?: string
  lastActive: number
  subagents?: SubagentInfo[]
}

/** Parse the last N lines of the most recent session file for subtask patterns */
async function parseSubagents(agentSessionsDir: string): Promise<SubagentInfo[]> {
  const subagents: SubagentInfo[] = []
  try {
    const files = await fs.readdir(agentSessionsDir)
    if (files.length === 0) return subagents

    // Find most recent file
    let latestFile = ''
    let latestTime = 0
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const filePath = path.join(agentSessionsDir, file)
      const stat = await fs.stat(filePath)
      if (stat.mtimeMs > latestTime) {
        latestTime = stat.mtimeMs
        latestFile = filePath
      }
    }
    if (!latestFile) return subagents

    // Read last 8KB for recent activity
    const stat = await fs.stat(latestFile)
    const readSize = Math.min(8192, stat.size)
    const handle = await fs.open(latestFile, 'r')
    const buffer = Buffer.alloc(readSize)
    await handle.read(buffer, 0, readSize, Math.max(0, stat.size - readSize))
    await handle.close()

    const content = buffer.toString('utf-8')
    const lines = content.split('\n').filter(l => l.trim())

    // Look for active subtask tool_use entries
    const activeSubtasks = new Map<string, string>()
    for (const line of lines) {
      try {
        const record = JSON.parse(line)
        if (record.type === 'assistant' && record.message?.content) {
          const blocks = Array.isArray(record.message.content) ? record.message.content : []
          for (const block of blocks) {
            if (block.type === 'tool_use' && typeof block.input?.description === 'string') {
              const desc = block.input.description as string
              if (desc.startsWith('Subtask:') || desc.includes('subtask')) {
                activeSubtasks.set(block.id, desc)
              }
            }
          }
        }
        // Clear completed subtasks
        if (record.type === 'user' && record.message?.content) {
          const blocks = Array.isArray(record.message.content) ? record.message.content : []
          for (const block of blocks) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              activeSubtasks.delete(block.tool_use_id)
            }
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }

    for (const [toolId, label] of activeSubtasks) {
      subagents.push({ toolId, label })
    }
  } catch {
    // Ignore parse errors
  }
  return subagents
}

export async function GET() {
  const openclawDir = path.join(os.homedir(), '.openclaw')
  const configPath = path.join(openclawDir, 'openclaw.json')
  const agentsDir = path.join(openclawDir, 'agents')

  const agents: AgentActivity[] = []

  try {
    if (existsSync(configPath)) {
      const configContent = await fs.readFile(configPath, 'utf8')
      const config = JSON.parse(configContent)

      const agentList = Array.isArray(config.agents) ? config.agents : config.agents?.list
      if (agentList && Array.isArray(agentList)) {
        const now = Date.now()

        for (const agent of agentList) {
          let lastActive = 0
          let agentSessionsDir = ''

          if (existsSync(agentsDir)) {
            agentSessionsDir = path.join(agentsDir, agent.id, 'sessions')
            if (existsSync(agentSessionsDir)) {
              try {
                const files = await fs.readdir(agentSessionsDir)
                for (const file of files) {
                  const filePath = path.join(agentSessionsDir, file)
                  const stat = await fs.stat(filePath)
                  if (stat.mtimeMs > lastActive) {
                    lastActive = stat.mtimeMs
                  }
                }
              } catch {
                // Ignore
              }
            }
          }

          let state: 'idle' | 'working' | 'waiting' | 'offline'
          const timeDiff = now - lastActive
          if (lastActive === 0 || timeDiff > 10 * 60 * 1000) {
            state = 'offline'
          } else if (timeDiff <= 2 * 60 * 1000) {
            state = 'working'
          } else {
            state = 'idle'
          }

          // Parse subagents for working agents
          let subagents: SubagentInfo[] | undefined
          if (state === 'working' && agentSessionsDir && existsSync(agentSessionsDir)) {
            subagents = await parseSubagents(agentSessionsDir)
            if (subagents.length === 0) subagents = undefined
          }

          agents.push({
            agentId: agent.id,
            name: agent.name || agent.id,
            emoji: agent.identity?.emoji || agent.emoji || '🤖',
            state,
            lastActive,
            subagents,
          })
        }
      }
    }
  } catch (error) {
    console.error('Error reading agent activity:', error)
  }

  return NextResponse.json({ agents })
}
