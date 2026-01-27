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
print(f"Custom HID: {controller.has_custom_hid}, Max keys: {controller.max_simultaneous_keys}")

# Main loop
while True:
    controller.update()

    # Check for host messages (if using custom HID)
    msg = controller.get_host_message()
    if msg:
        # Process host message - strip null padding and decode if text
        msg_stripped = msg.rstrip(b'\x00')
        if msg_stripped:
            try:
                text = msg_stripped.decode('utf-8')
                print(f"Host message: {text}")
            except UnicodeDecodeError:
                print(f"Host data: {msg_stripped.hex()}")

    time.sleep(0.01)  # 10ms loop delay
