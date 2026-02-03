# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- `bun install` - Install dependencies
- `bun run start` - Run the application
- `bun run dev` - Run with watch mode (auto-restart on changes)
- `bun run build` - Build for production
- `bun run src/index.ts list-devices` - List available HID devices
- `bun run src/index.ts config.yaml` - Run with specific config file

## Architecture

```
src/
├── index.ts              # Entry point, CLI, wiring
├── types.ts              # Shared type definitions
├── hid/
│   ├── device.ts         # HID connection, read/write, reconnection
│   └── discovery.ts      # Device enumeration by vendor/product ID
├── gesture/
│   ├── types.ts          # Gesture type definitions
│   └── detector.ts       # Timing-based state machine (press/double/long)
├── websocket/
│   └── server.ts         # WebSocket server, notification queue, responses
└── config/
    ├── loader.ts         # YAML parsing, validation, defaults
    └── watcher.ts        # chokidar-based hot-reload
```

## Key Patterns

- Event-driven: HID button events → gesture detector → notification server → response
- Config hot-reload via chokidar file watching
- Gesture state machine: idle → pressed → (longPress | waitDouble → (press | doublePressed → doublePress))
- WebSocket notification queue with oldest-first response matching
- Automatic HID reconnection on disconnect

## Data Flow

```
┌─────────────────┐     HID      ┌─────────────────┐    WebSocket    ┌─────────────────┐
│   Macropad      │◄────────────►│  camel-pad      │◄───────────────►│  Claude Code    │
│    (ESPHome)    │              │  (TypeScript)   │                 │  Plugin         │
└─────────────────┘              └─────────────────┘                 └─────────────────┘
     Buttons                          Bridge                          Notifications
     Display                       Gesture detection
                                   Key mapping
                                   Config (hot-reload)
```

## Communication Protocol

The ESPHome firmware uses USB CDC ACM (serial) via TinyUSB. Message format:
- Send text: `[0x01, ...text bytes]` (64-byte packets)
- Receive button: `[0x02, button_id, pressed (0/1)]`

Note: The bridge code still uses node-hid which expects HID device class. Integration with the ESPHome CDC ACM interface may require updating the bridge to use serial communication.

## WebSocket Protocol

- Notification: `{"type": "notification", "id": "uuid", "text": "...", "category": "..."}`
- Response: `{"type": "response", "id": "uuid", "action": "approve", "label": "Yes"}`
- Error: `{"type": "error", "id": "uuid", "error": "Timeout"}`

## Client Application

The pad firmware is in the ./pad directory, written in ESPHome (ESP-IDF framework). Key configuration:
- **Device**: ESP32-S3 with PSRAM, 16MB flash
- **Display**: Waveshare 3.16" 320x820 MIPI RGB with LVGL
- **Communication**: USB CDC ACM via TinyUSB
- **Build/Flash**: `esphome run pad/esphome.yaml`

## Claude Code Plugin

The camel-pad-bridge plugin in ./camel-pad-bridge integrates with Claude Code to forward notifications to this application.
