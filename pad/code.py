"""
Camel Pad - CircuitPython HID Keyboard Controller

Supports single press, double press, and long press gestures for multiple buttons.
Configuration is loaded from config.py.
"""
import time
import board
from adafruit_hid.keycode import Keycode
from controller import PadController

# Try to import config, use defaults if not present
try:
    from config import TIMING, BUTTONS, BUTTON_PINS
    
except ImportError:
    TIMING = {
        "double_press_window_ms": 300,
        "long_press_threshold_ms": 500,
    }
    BUTTON_PINS = [board.BOOT0]
    BUTTONS = {
        0: {
            "press": [Keycode.CONTROL, Keycode.GRAVE_ACCENT],
        },
    }


# Initialize the controller
controller = PadController(BUTTON_PINS, BUTTONS, TIMING)

print("Camel Pad ready!")
print(f"Buttons: {controller.button_count}, Configured: {controller.configured_buttons}")

# Main loop
while True:
    controller.update()
    time.sleep(0.01)  # 10ms loop delay
