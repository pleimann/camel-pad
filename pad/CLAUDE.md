# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `esphome run esphome.yaml` - Compile and upload to device (USB or OTA)
- `esphome compile esphome.yaml` - Compile only
- `esphome logs esphome.yaml` - View device logs
- `esphome config esphome.yaml` - Validate configuration

## Architecture

This is an ESPHome firmware project for the CamelPad hardware controller, running on an ESP32-S3 with PSRAM.

```
esphome.yaml         # Main ESPHome configuration
secrets.yaml         # WiFi credentials (gitignored)
.esphome/            # Build artifacts (gitignored)
```

## Hardware

- **MCU**: ESP32-S3 with 16MB flash, octal PSRAM at 80MHz
- **Display**: Waveshare 3.16" 320x820 MIPI RGB (rotated 90°)
- **Input**: Adafruit Seesaw (I2C 0x49) with 4 buttons (pins 11-14)
- **LEDs**: 4 NeoPixels via Seesaw (pin 2)
- **USB**: TinyUSB CDC ACM for serial communication

## Pin Mapping

| Interface | Pins |
|-----------|------|
| SPI (Display) | CLK: GPIO2, MOSI: GPIO1 |
| I2C (Seesaw) | SDA: GPIO15, SCL: GPIO7 |

### Seesaw Pins

- Pin 2: NeoPixels (x4)
- Pin 11-14: Key01-Key04

## UI Components (LVGL)

- `lv_status` - Status label at top (scrolling)
- `lv_textarea` - Main text display area
- `lv_buttonmatrix` - 4-button row at bottom (btn_1 through btn_4)

## Communication

- **Home Assistant API**: Encrypted connection for HA integration
- **OTA**: Password-protected over-the-air updates
- **WiFi**: Configured via secrets.yaml, fallback AP mode ("CamelPad Hotspot")
- **USB CDC**: Serial communication with 1024-byte RX buffer

## Companion Application

The TypeScript bridge application in the parent directory handles WebSocket communication with Claude Code. See `../CLAUDE.md` for details.
