"""
CamelPad main application.
Handles HID communication with host and button/display management.
"""
import board
import keypad
import usb_hid
import displayio
import terminalio
from adafruit_display_text import label

# HID message types (must match host protocol)
MSG_DISPLAY_TEXT = 0x01
MSG_BUTTON = 0x02

# Report size
REPORT_SIZE = 64

# Button pins (adjust for your hardware)
BUTTON_PINS = [board.IO0, board.IO1, board.IO2, board.IO3]


def find_vendor_hid_device():
    """Find our custom vendor-specific HID device."""
    for device in usb_hid.devices:
        # Look for vendor-specific usage page (0xFF00)
        if device.usage_page == 0xFF00 and device.usage == 0x01:
            return device
    return None


def setup_display():
    """Set up the display with a text label."""
    display = board.DISPLAY

    # Create display group
    group = displayio.Group()

    # Create text label
    text_label = label.Label(
        terminalio.FONT,
        text="Ready",
        color=0xFFFFFF,
        x=10,
        y=display.height // 2,
        scale=2,
    )
    group.append(text_label)

    display.root_group = group
    return display, text_label


def main():
    # Find the custom HID device
    hid_device = find_vendor_hid_device()
    if not hid_device:
        print("ERROR: Vendor HID device not found. Check boot.py")
        return

    print(f"HID device found: usage_page=0x{hid_device.usage_page:04x}")

    # Set up display
    display, text_label = setup_display()
    print(f"Display: {display.width}x{display.height}")

    # Set up button keypad
    buttons = keypad.Keys(BUTTON_PINS, value_when_pressed=False)
    print(f"Buttons: {len(BUTTON_PINS)} configured")

    # Pre-allocate buffers
    out_report = bytearray(REPORT_SIZE)
    in_buffer = bytearray(REPORT_SIZE)

    print("CamelPad ready")

    while True:
        # Handle button events
        while (event := buttons.events.get()) is not None:
            button_id = event.key_number
            pressed = 1 if event.pressed else 0

            # Send button event to host
            out_report[0] = MSG_BUTTON
            out_report[1] = button_id
            out_report[2] = pressed
            # Clear rest of report
            for i in range(3, REPORT_SIZE):
                out_report[i] = 0

            try:
                hid_device.send_report(out_report)
                print(f"Button {button_id} {'pressed' if pressed else 'released'}")
            except Exception as e:
                print(f"HID send error: {e}")

        # Check for incoming HID data from host
        try:
            # get_last_received_report returns None if no data
            data = hid_device.get_last_received_report()
            if data and len(data) > 0:
                msg_type = data[0]

                if msg_type == MSG_DISPLAY_TEXT:
                    # Extract text (bytes 1-63, null-terminated)
                    text_bytes = bytes(data[1:])
                    # Find null terminator or use full length
                    try:
                        null_pos = text_bytes.index(0)
                        text = text_bytes[:null_pos].decode('utf-8')
                    except ValueError:
                        text = text_bytes.decode('utf-8', errors='replace')

                    text_label.text = text
                    print(f"Display: {text}")

        except Exception as e:
            # No data available or error - this is normal
            pass


if __name__ == "__main__":
    main()
