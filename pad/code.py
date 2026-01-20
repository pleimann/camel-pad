import time

import board
import digitalio
import usb_hid
from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode

# Try to import config, use defaults if not present
try:
    from config import TIMING, BUTTONS
    
except ImportError:
    # Default config if config.py doesn't exist yet
    TIMING = {
        "double_press_window_ms": 300,
        "long_press_threshold_ms": 500,
    }
    BUTTONS = {
        0: {
            "press": [Keycode.CONTROL, Keycode.GRAVE_ACCENT],
        },
    }


class GestureState:
    """State machine states for gesture detection."""
    IDLE = 0
    PRESSED = 1
    WAIT_DOUBLE = 2
    DOUBLE_PRESSED = 3


class ButtonGestureDetector:
    """Detects single press, double press, and long press gestures for a button."""

    def __init__(self, button_index, config, keyboard):
        self.button_index = button_index
        self.config = config
        self.keyboard = keyboard

        # Timing configuration (convert ms to seconds for time.monotonic())
        self.double_press_window = TIMING["double_press_window_ms"] / 1000.0
        self.long_press_threshold = TIMING["long_press_threshold_ms"] / 1000.0

        # State machine
        self.state = GestureState.IDLE
        self.press_time = 0
        self.release_time = 0
        self.long_press_fired = False

    def update(self, is_pressed, current_time):
        """Update the gesture state machine. Call this every loop iteration."""

        if self.state == GestureState.IDLE:
            if is_pressed:
                # Button just pressed
                self.state = GestureState.PRESSED
                self.press_time = current_time
                self.long_press_fired = False

        elif self.state == GestureState.PRESSED:
            if is_pressed:
                # Still pressed - check for long press
                if not self.long_press_fired:
                    hold_duration = current_time - self.press_time
                    if hold_duration >= self.long_press_threshold:
                        self._fire_gesture("long_press")
                        self.long_press_fired = True
            else:
                # Released
                hold_duration = current_time - self.press_time
                if self.long_press_fired:
                    # Long press already fired, go back to idle
                    self.state = GestureState.IDLE
                elif hold_duration < self.long_press_threshold:
                    # Short press - wait for potential double press
                    self.state = GestureState.WAIT_DOUBLE
                    self.release_time = current_time
                else:
                    # Shouldn't happen, but just in case
                    self.state = GestureState.IDLE

        elif self.state == GestureState.WAIT_DOUBLE:
            if is_pressed:
                # Second press detected - this is a double press
                self.state = GestureState.DOUBLE_PRESSED
                self.press_time = current_time
            else:
                # Still waiting - check for timeout
                wait_duration = current_time - self.release_time
                if wait_duration >= self.double_press_window:
                    # Timeout - fire single press
                    self._fire_gesture("press")
                    self.state = GestureState.IDLE

        elif self.state == GestureState.DOUBLE_PRESSED:
            if not is_pressed:
                # Released after second press - fire double press
                self._fire_gesture("double_press")
                self.state = GestureState.IDLE

    def _fire_gesture(self, gesture_type):
        """Execute the action for a gesture type."""
        if gesture_type not in self.config:
            return

        keys = self.config[gesture_type]
        if not keys:
            return

        # Check if it's a sequence (list of lists) or a single combo (flat list)
        if keys and isinstance(keys[0], list):
            # Sequence of key combos
            for combo in keys:
                self._send_keys(combo)
                time.sleep(0.05)  # Small delay between sequence items
        else:
            # Single key combo
            self._send_keys(keys)

    def _send_keys(self, keycodes):
        """Send a key combination."""
        if keycodes:
            self.keyboard.send(*keycodes)


# Set up the boot button (GPIO0 on ESP32-S3)
boot_button = digitalio.DigitalInOut(board.BOOT0)
boot_button.direction = digitalio.Direction.INPUT
boot_button.pull = digitalio.Pull.UP

# Set up the keyboard
keyboard = Keyboard(usb_hid.devices)

# Create gesture detectors for configured buttons
detectors = {}
for button_index, button_config in BUTTONS.items():
    detectors[button_index] = ButtonGestureDetector(button_index, button_config, keyboard)

# For now, we only have the boot button mapped to index 0
boot_button_detector = detectors.get(0)

print("Camel Pad ready!")
print(f"Configured buttons: {list(BUTTONS.keys())}")

while True:
    current_time = time.monotonic()

    # Read boot button (active LOW - pressed = False, so invert)
    boot_button_pressed = not boot_button.value

    # Update gesture detector
    if boot_button_detector:
        boot_button_detector.update(boot_button_pressed, current_time)

    time.sleep(0.01)  # 10ms loop delay
