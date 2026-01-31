# camel-pad TypeScript Rewrite Design

**Date:** 2026-01-30
**Status:** Approved
**Goal:** Replace Go implementation with TypeScript for unified stack with Claude Code plugin

## Overview

The TypeScript app bridges the macropad hardware with the Claude Code plugin:

```
┌─────────────────┐     HID      ┌─────────────────┐    WebSocket    ┌─────────────────┐
│   Macropad      │◄────────────►│  camel-pad      │◄───────────────►│  Claude Code    │
│  (CircuitPython)│              │  (TypeScript)   │                 │  Plugin         │
└─────────────────┘              └─────────────────┘                 └─────────────────┘
     Buttons                          Bridge                          Notifications
     Display                       Gesture detection
                                   Key mapping
                                   Config (hot-reload)
```

## Scope

### Included
- HID communication (read buttons, send text)
- Gesture detection (press, double-press, long-press)
- WebSocket server on port 52914
- Key-to-action mapping
- YAML config with hot-reload

### Excluded (vs Go version)
- PTY management
- Framebuffer rendering (CircuitPython handles display)
- Chord detection (multiple simultaneous buttons)

## Module Structure

```
camel-pad/
├── src/
│   ├── index.ts              # Entry point, CLI
│   ├── hid/
│   │   ├── device.ts         # HID connection, read/write
│   │   └── discovery.ts      # Find macropad by vendor/product ID
│   ├── gesture/
│   │   ├── detector.ts       # Timing state machine per button
│   │   └── types.ts          # Press, DoublePress, LongPress
│   ├── websocket/
│   │   └── server.ts         # WebSocket server, message handling
│   ├── config/
│   │   ├── loader.ts         # YAML parsing, validation
│   │   └── watcher.ts        # File watch, hot-reload
│   └── types.ts              # Shared types
├── config.yaml               # Default config location
├── package.json
└── tsconfig.json
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `node-hid` | USB HID communication |
| `ws` | WebSocket server |
| `yaml` | Config parsing |
| `chokidar` | File watching for hot-reload |

## Gesture Detection

Timing-based state machine per button:

```
         ┌─────────────────────────────────────────┐
         │                                         │
         ▼                                         │
      [IDLE] ──press──► [PRESSED] ──release──► [WAIT_DOUBLE]
                            │                      │
                            │ hold > 500ms         │ timeout 300ms
                            ▼                      ▼
                      emit LONG_PRESS          emit PRESS
                            │                      │
                            │                      │ press within 300ms
                            │                      ▼
                            │              [DOUBLE_PRESSED]
                            │                      │
                            │                      │ release
                            │                      ▼
                            │              emit DOUBLE_PRESS
                            │                      │
                            └──────────────────────┘
                                   → IDLE
```

**Timing constants (configurable):**
- `longPressMs`: 500ms
- `doublePressMs`: 300ms

## WebSocket Protocol

**Server:** `ws://localhost:52914`

### Messages

```typescript
// Plugin → camel-pad
{ type: "notification", id: "uuid", text: "...", category: "..." }
{ type: "test", id: "uuid", text: "..." }
{ type: "message", id: "uuid", text: "..." }

// camel-pad → Plugin
{ type: "response", id: "uuid", action: "approve", label: "Yes" }
{ type: "error", id: "uuid", error: "Timeout waiting for response" }
```

### Flow
1. Plugin connects, sends notification
2. camel-pad displays text on macropad via HID
3. User presses button → gesture detected → mapped to action
4. camel-pad sends response with matching `id`
5. Connection stays open for multiple notifications

## HID Protocol

### Send text to display
```typescript
const MSG_DISPLAY_TEXT = 0x01;
// [MSG_DISPLAY_TEXT, ...text bytes] in 64-byte report
```

### Receive button events
```typescript
const MSG_BUTTON = 0x02;
// [MSG_BUTTON, button_id, pressed (1/0)]
```

## Configuration

```yaml
device:
  vendorId: 0x1234
  productId: 0x5678

server:
  port: 52914
  host: localhost

gestures:
  longPressMs: 500
  doublePressMs: 300

keys:
  key1:
    press:
      action: approve
      label: "Yes"
    longPress:
      action: skip
      label: "Skip"
  key2:
    press:
      action: deny
      label: "No"
  key3:
    press:
      action: info
      label: "More Info"
    doublePress:
      action: cancel
      label: "Cancel"

defaults:
  timeoutMs: 30000
```

### Hot-reload
- Watch config file with chokidar
- On change: reload, validate, update in-memory
- Log changes, don't restart connections

## Implementation Notes

- Use EventEmitter pattern for HID → Gesture → WebSocket flow
- Queue pending notifications by `id`
- Resolve oldest pending when gesture detected
- Graceful shutdown: close HID, close WebSocket connections
