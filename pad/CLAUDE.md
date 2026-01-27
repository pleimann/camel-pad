# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `../scripts/sync-pad.sh` - Sync code to device (requires CIRCUITPY mount at /Volumes/CIRCUITPY)
- `../scripts/circup-install.sh <library>` - Install CircuitPython libraries over WiFi via circup

## Architecture

This is a CircuitPython client application for the camel-pad hardware controller, running on an Adafruit Feather ESP32-S3 TFT.

```
code.py              # Main entry point and event loop
config.py            # Button mappings, pin config, and timing settings
controller.py        # PadController class - keypad and detector management
gesture.py           # ButtonGestureDetector class - gesture state machine
settings.toml        # WiFi credentials and web API configuration
lib/                 # Pre-compiled Adafruit libraries (.mpy)
```

## Key Patterns

- **Class-based architecture**: `PadController` manages keypad and detectors, `ButtonGestureDetector` handles per-button state
- **Event-driven input**: Uses `keypad.Keys()` for efficient button event detection
- **Gesture state machine**: `IDLE` → `PRESSED` → `WAIT_DOUBLE` / `DOUBLE_PRESSED` → back to `IDLE`
- Detects three gesture types: `press`, `double_press`, `long_press`
- Configurable timing: `double_press_window_ms` (300ms default), `long_press_threshold_ms` (500ms default)
- Multi-button support via configurable `BUTTON_PINS` list
- USB HID keyboard output via `adafruit_hid.keyboard`
- 10ms polling loop for responsive input detection

## Configuration

All configuration is defined in `config.py`:

```python
from adafruit_hid.keycode import Keycode
import board

# Timing configuration
TIMING = {
    "double_press_window_ms": 300,   # Max time between presses for double-click
    "long_press_threshold_ms": 500,  # Hold duration for long press
}

# Button pins (index corresponds to button number)
BUTTON_PINS = [
    board.BOOT0,  # Button 0
    # board.D5,   # Button 1
]

# Button action mappings
BUTTONS = {
    0: {
        "press": [Keycode.CONTROL, Keycode.GRAVE_ACCENT],      # Single combo
        "double_press": [[Keycode.A], [Keycode.B]],            # Sequence of combos
        "long_press": [Keycode.ESCAPE],
    },
}
```

## Companion Application

The Go desktop application in the parent directory handles device discovery, display updates, and PTY integration. See `../CLAUDE.md` for details.
