# Firmware Development Plan: CamelPad Arduino Firmware

## Overview

Build Arduino (PlatformIO) firmware for the Waveshare ESP32-S3-LCD-3.16 board with:
- **Display**: 320x820 ST7701 via LovyanGFX (simple drawing API, rotated to 820x320 landscape)
- **Input**: 4 buttons via Adafruit Seesaw (I2C, address 0x49)
- **Output**: 4 NeoPixels via Adafruit Seesaw
- **Communication**: USB CDC ACM serial to the bridge application

### Why LovyanGFX (not Adafruit GFX / TFT_eSPI)

The display uses a 16-bit RGB parallel interface — Adafruit GFX and TFT_eSPI don't support this. LovyanGFX has built-in `Panel_ST7701` + `Bus_RGB` classes that handle the 3-wire SPI init and RGB parallel data bus natively on ESP32-S3. Its drawing API is similar to Adafruit GFX (`fillRect`, `drawString`, `setTextColor`, etc.).

Arduino_GFX was also considered but its `ESP32RGBPanel` is broken on arduino-esp32 v3.x.

---

## Project Structure

```
firmware/
├── platformio.ini
├── src/
│   ├── main.cpp                    # setup/loop, wiring
│   ├── config.h                    # Pin definitions, constants
│   ├── display/
│   │   ├── display_config.h        # LovyanGFX device class (LGFX_CamelPad)
│   │   ├── display_manager.h       # Display manager header
│   │   └── display_manager.cpp     # UI layout, rendering
│   ├── seesaw/
│   │   ├── seesaw_manager.h
│   │   └── seesaw_manager.cpp      # Button polling, NeoPixel control
│   └── comms/
│       ├── protocol.h              # Message frame format
│       ├── serial_comms.h
│       └── serial_comms.cpp        # USB CDC parsing/sending
```

---

## Implementation Steps

### Step 1: PlatformIO Project Skeleton

Create `firmware/platformio.ini`:
- `platform = espressif32@6.9.0`, `framework = arduino`, `board = esp32-s3-devkitc-1`
- 16MB flash, QIO/OPI PSRAM, `default_16MB.csv` partitions
- USB flags: `ARDUINO_USB_MODE=0` (TinyUSB), `ARDUINO_USB_CDC_ON_BOOT=1`
- Libraries: `lovyan03/LovyanGFX@^1.2.0`, `adafruit/Adafruit seesaw Library@^1.7.0`

Create `firmware/src/config.h` with all pin definitions from Waveshare `user_config.h` plus Seesaw and protocol constants.

### Step 2: Display Bring-Up (Highest Risk)

Create `firmware/src/display/display_config.h` — a `LGFX_CamelPad` class (subclass of `lgfx::LGFX_Device`) that configures:
- `lgfx::Panel_ST7701` with custom Waveshare init commands (the 40 commands from `lvgl_port.c:32-81`)
- `lgfx::Bus_RGB` with all 16 data pins in BGR order (d0-d4=Blue, d5-d10=Green, d11-d15=Red)
- `lgfx::Light_PWM` for backlight on GPIO6
- RGB timing: 18MHz pixel clock, hsync/vsync porches matching Waveshare values
- 90-degree rotation for landscape mode (820x320)

**Fallback**: If LovyanGFX's `Panel_ST7701` doesn't accept the custom init sequence cleanly, do manual 3-wire SPI bit-bang init then use `lgfx::Panel_RGB` for just the RGB bus.

Write a minimal `main.cpp` that inits the display and draws a test pattern to verify hardware works.

### Step 3: Display Manager + UI Layout

Create `firmware/src/display/display_manager.h/.cpp` with a `DisplayManager` class:

**Rendering**: Use `LGFX_Sprite` as full-screen double buffer in PSRAM (820x320 x 2 bytes = ~525KB). Draw to sprite, push to display — avoids flicker.

**Layout** (820x320 landscape after rotation):
```
┌──────────────────────────────────────────────────────┐
│ STATUS BAR (820 x 30)    "Connected" / queue info    │
├──────────────────────────────────────────────────────┤
│                                                      │
│ NOTIFICATION TEXT (820 x 220)                        │
│ "Claude wants to run: npm install"                   │
│                                                      │
├──────────────────────────────────────────────────────┤
│ [Approve]   [Deny]     [Skip]     [Details]          │
│ BUTTON LABELS (820 x 70) — 4 zones, 205px each      │
└──────────────────────────────────────────────────────┘
```

Public API:
- `begin()` — init display + sprite
- `setStatusText(text)` / `setNotificationText(text)` / `setButtonLabels(b1,b2,b3,b4)`
- `showIdleScreen()` / `showNotification(text, category)`
- `update()` — flush sprite to display

### Step 4: Seesaw Integration

Create `firmware/src/seesaw/seesaw_manager.h/.cpp` using `Adafruit_seesaw` + `seesaw_NeoPixel`:
- I2C on SDA=GPIO15, SCL=GPIO7
- 4 buttons on Seesaw pins 11-14 (INPUT_PULLUP, active low)
- 4 NeoPixels on Seesaw pin 2
- `poll()` reads button states, fires callback on change
- `setPixelColor(index, color)` / `showPixels()` for LED control

### Step 5: Serial Communication Protocol

Create `firmware/src/comms/protocol.h` and `serial_comms.h/.cpp`.

**Frame format** (length-prefixed binary, suitable for stream-based serial):
```
[0xAA] [LEN_HI] [LEN_LO] [MSG_TYPE] [PAYLOAD...] [CHECKSUM_XOR]
```

**Message types** (matching existing constants in `types.ts`):

| Direction | Type | Byte | Payload |
|-----------|------|------|---------|
| Host→Device | Display Text | `0x01` | UTF-8 text |
| Device→Host | Button Event | `0x02` | `[button_id, pressed]` |
| Host→Device | Set LEDs | `0x03` | `[idx, R, G, B]` repeated |
| Host→Device | Status Text | `0x04` | UTF-8 text |
| Host→Device | Clear | `0x05` | (empty) |
| Host→Device | Button Labels | `0x06` | `[len, label...]` x 4 |
| Device→Host | Heartbeat | `0x07` | `[status]` |

`SerialComms` class: state-machine parser in `poll()`, callback-based dispatch.

### Step 6: Wire Everything Together in main.cpp

- `setup()`: Init Serial (CDC), display, seesaw, comms. Show idle screen.
- `loop()`: `comms.poll()` + `seesaw.poll()` at ~100Hz
- Button callback → sends event via serial + NeoPixel feedback
- Display text callback → updates notification area
- Status/labels/clear callbacks → update display accordingly

---

## Key Reference Files

- `../ESP32-S3-LCD-3.16-Demo/Arduino/examples/08_LVGL_V9_Test/lvgl_port.c` — ST7701 init commands (lines 32-81) and RGB panel config
- `../ESP32-S3-LCD-3.16-Demo/Arduino/examples/08_LVGL_V9_Test/user_config.h` — Pin definitions
- `src/hid/device.ts` — Bridge HID communication (to be replaced with serial)
- `src/types.ts` — Protocol constants (`MSG_DISPLAY_TEXT=0x01`, `MSG_BUTTON=0x02`)
- `pad/esphome.yaml` — Reference UI layout and seesaw pin config

## Verification

1. **Display**: Flash firmware, verify test pattern appears on screen
2. **Buttons**: Press each seesaw button, verify serial output via `platformio device monitor`
3. **NeoPixels**: Verify LED feedback on button press
4. **Serial protocol**: Send test frames from a Python script, verify display updates
5. **Integration**: Run the bridge with serial port support, verify end-to-end notification flow

## Out of Scope (for now)

- Updating the TypeScript bridge from HID to serial (separate task)
- Gesture detection on firmware side (bridge handles this)
- WiFi/OTA (not needed for USB-tethered operation)
