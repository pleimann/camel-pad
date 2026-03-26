#!/usr/bin/env bun
/**
 * camel-pad Channel Server
 *
 * MCP channel server that bridges Claude Code sessions to the camel-pad
 * tray application. Provides:
 *
 * - Permission relay: tool approval prompts displayed on device, button press
 *   sends verdict back to Claude Code
 * - Button event notifications: unsolicited button presses pushed to Claude
 * - MCP tools: display text, status, LEDs, labels on the device
 *
 * Communication:
 *   Claude Code <-- stdio/MCP --> this server <-- WebSocket --> bridge tray app
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import WebSocket from 'ws'
import fs from 'fs'
import path from 'path'
import os from 'os'
import YAML from 'yaml'

// ---------------------------------------------------------------------------
// Config loading (mirrors plugin/hooks/scripts/config-path.js)
// ---------------------------------------------------------------------------

function getConfigPath(): string {
  const platform = os.platform()
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'camel-pad', 'config.yaml')
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'camel-pad', 'config.yaml')
  } else {
    return path.join(os.homedir(), '.config', 'camel-pad', 'config.yaml')
  }
}

interface BridgeConfig {
  host: string
  port: number
  timeoutMs: number
}

function loadConfig(): BridgeConfig | null {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) return null
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    const config = YAML.parse(content)
    if (!config?.server) return null
    return {
      host: config.server.host || 'localhost',
      port: config.server.port || 52914,
      timeoutMs: config.defaults?.timeoutMs ?? 30000,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Logging (all output to stderr to avoid interfering with stdio MCP transport)
// ---------------------------------------------------------------------------

function log(...args: any[]) {
  process.stderr.write(`[camel-pad channel] ${args.join(' ')}\n`)
}

// ---------------------------------------------------------------------------
// WebSocket connection to bridge
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null
let wsReady = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const RECONNECT_DELAY_MS = 3000

// Callbacks for messages from the bridge
type BridgeMessageHandler = (message: any) => void
const bridgeHandlers: BridgeMessageHandler[] = []

function onBridgeMessage(handler: BridgeMessageHandler) {
  bridgeHandlers.push(handler)
}

function sendToBridge(message: any): boolean {
  if (!ws || !wsReady) return false
  try {
    ws.send(JSON.stringify(message))
    return true
  } catch (err) {
    log('Failed to send to bridge:', err)
    return false
  }
}

function connectToBridge(config: BridgeConfig) {
  if (ws) {
    try { ws.close() } catch {}
    ws = null
    wsReady = false
  }

  const endpoint = `ws://${config.host}:${config.port}`
  log(`Connecting to bridge at ${endpoint}`)

  try {
    ws = new WebSocket(endpoint)
  } catch (err) {
    log('Failed to create WebSocket:', err)
    scheduleReconnect(config)
    return
  }

  ws.on('open', () => {
    log('Connected to bridge, registering as channel client')
    // Register as channel client
    ws!.send(JSON.stringify({ type: 'register', role: 'channel' }))
  })

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())

      if (message.type === 'registered') {
        wsReady = true
        log('Registered as channel client')
        return
      }

      // Dispatch to handlers
      for (const handler of bridgeHandlers) {
        handler(message)
      }
    } catch (err) {
      log('Failed to parse bridge message:', err)
    }
  })

  ws.on('close', () => {
    log('Bridge connection closed')
    wsReady = false
    ws = null
    scheduleReconnect(config)
  })

  ws.on('error', (err) => {
    log('Bridge connection error:', (err as Error).message)
  })
}

function scheduleReconnect(config: BridgeConfig) {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectToBridge(config)
  }, RECONNECT_DELAY_MS)
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcp = new Server(
  { name: 'camel-pad', version: '0.1.0' },
  {
    capabilities: {
      experimental: {
        'claude/channel': {},
        'claude/channel/permission': {},
      },
      tools: {},
    },
    instructions: [
      'A camel-pad macropad device is connected. It has a display and 4 physical buttons.',
      '',
      'Button press events arrive as <channel source="camel-pad" button="..." gesture="..." label="...">.',
      'These are unsolicited presses — the user tapped a button without a pending prompt.',
      'Interpret them based on the label and current context.',
      '',
      'Available tools for the device:',
      '- display_text: Show a message on the device display',
      '- display_status: Show a short status in the status bar',
      '- clear_display: Clear the device display',
      '- set_leds: Set LED colors on the device buttons',
      '- set_labels: Set text labels shown on the device buttons',
      '',
      'Permission prompts (tool approvals) are automatically shown on the device.',
      'The user can approve or deny from the physical buttons.',
    ].join('\n'),
  },
)

// ---------------------------------------------------------------------------
// MCP Tools
// ---------------------------------------------------------------------------

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'display_text',
      description: 'Show a message on the camel-pad device display',
      inputSchema: {
        type: 'object' as const,
        properties: {
          text: { type: 'string', description: 'The text to display' },
        },
        required: ['text'],
      },
    },
    {
      name: 'display_status',
      description: 'Show a short status message in the camel-pad status bar',
      inputSchema: {
        type: 'object' as const,
        properties: {
          text: { type: 'string', description: 'The status text' },
        },
        required: ['text'],
      },
    },
    {
      name: 'clear_display',
      description: 'Clear the camel-pad device display',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'set_leds',
      description: 'Set LED colors on the camel-pad device buttons',
      inputSchema: {
        type: 'object' as const,
        properties: {
          leds: {
            type: 'array',
            description: 'Array of LED settings',
            items: {
              type: 'object',
              properties: {
                index: { type: 'number', description: 'Button index (0-3)' },
                r: { type: 'number', description: 'Red (0-255)' },
                g: { type: 'number', description: 'Green (0-255)' },
                b: { type: 'number', description: 'Blue (0-255)' },
              },
              required: ['index', 'r', 'g', 'b'],
            },
          },
        },
        required: ['leds'],
      },
    },
    {
      name: 'set_labels',
      description: 'Set text labels shown on the camel-pad device buttons (4 labels, one per button)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          labels: {
            type: 'array',
            description: 'Array of 4 label strings, one per button',
            items: { type: 'string' },
          },
        },
        required: ['labels'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params
  const id = crypto.randomUUID()

  switch (name) {
    case 'display_text': {
      const { text } = args as { text: string }
      const sent = sendToBridge({ type: 'display_command', id, command: 'text', payload: { text } })
      return { content: [{ type: 'text', text: sent ? 'Displayed on device' : 'Device not connected' }] }
    }

    case 'display_status': {
      const { text } = args as { text: string }
      const sent = sendToBridge({ type: 'display_command', id, command: 'status', payload: { text } })
      return { content: [{ type: 'text', text: sent ? 'Status updated' : 'Device not connected' }] }
    }

    case 'clear_display': {
      const sent = sendToBridge({ type: 'display_command', id, command: 'clear', payload: {} })
      return { content: [{ type: 'text', text: sent ? 'Display cleared' : 'Device not connected' }] }
    }

    case 'set_leds': {
      const { leds } = args as { leds: Array<{ index: number; r: number; g: number; b: number }> }
      const sent = sendToBridge({ type: 'display_command', id, command: 'leds', payload: { leds } })
      return { content: [{ type: 'text', text: sent ? 'LEDs updated' : 'Device not connected' }] }
    }

    case 'set_labels': {
      const { labels } = args as { labels: string[] }
      const sent = sendToBridge({ type: 'display_command', id, command: 'labels', payload: { labels } })
      return { content: [{ type: 'text', text: sent ? 'Labels updated' : 'Device not connected' }] }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

// ---------------------------------------------------------------------------
// Permission relay
// ---------------------------------------------------------------------------

const PermissionRequestSchema = z.object({
  method: z.literal('notifications/claude/channel/permission_request'),
  params: z.object({
    request_id: z.string(),
    tool_name: z.string(),
    description: z.string(),
    input_preview: z.string(),
  }),
})

mcp.setNotificationHandler(PermissionRequestSchema, async ({ params }) => {
  const { request_id, tool_name, description, input_preview } = params
  log(`Permission request: ${tool_name} — ${description}`)

  // Send to bridge as a permission_request message
  const sent = sendToBridge({
    type: 'permission_request',
    id: request_id,
    tool: tool_name,
    description,
    input_preview,
  })

  if (!sent) {
    log('Bridge not connected, cannot relay permission request')
    return
  }

  // Wait for verdict from bridge (arrives as permission_verdict message)
  const verdict = await new Promise<'allow' | 'deny'>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup()
      resolve('deny')
    }, 60000) // 60s timeout for permission decisions

    function onMessage(message: any) {
      if (message.type === 'permission_verdict' && message.id === request_id) {
        cleanup()
        resolve(message.verdict)
      }
    }

    function cleanup() {
      clearTimeout(timeout)
      const idx = bridgeHandlers.indexOf(onMessage)
      if (idx >= 0) bridgeHandlers.splice(idx, 1)
    }

    bridgeHandlers.push(onMessage)
  })

  log(`Permission verdict for ${request_id}: ${verdict}`)

  // Send verdict back to Claude Code
  await mcp.notification({
    method: 'notifications/claude/channel/permission',
    params: {
      request_id,
      behavior: verdict,
    },
  })
})

// ---------------------------------------------------------------------------
// Button event notifications (bridge → Claude)
// ---------------------------------------------------------------------------

onBridgeMessage((message) => {
  if (message.type === 'button_event') {
    const { buttonId, gesture, label } = message
    log(`Button event: ${buttonId} ${gesture} (${label})`)

    mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: `User pressed ${label || buttonId} on camel-pad`,
        meta: {
          button: buttonId,
          gesture,
          label: label || '',
        },
      },
    }).catch((err) => {
      log('Failed to push button event to Claude:', err)
    })
  }
})

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig()
  if (!config) {
    log('No config found — channel server will start but bridge connection unavailable')
    log(`Expected config at: ${getConfigPath()}`)
  }

  // Connect MCP transport first (Claude Code spawns us)
  await mcp.connect(new StdioServerTransport())
  log('MCP transport connected')

  // Connect to bridge if config available
  if (config) {
    connectToBridge(config)
  }
}

main().catch((err) => {
  log('Fatal error:', err)
  process.exit(1)
})
