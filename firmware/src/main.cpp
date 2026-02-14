#include <Arduino.h>
#include "config.h"
#include "display/display_manager.h"
#include "seesaw/seesaw_manager.h"
#include "comms/serial_comms.h"

// With ARDUINO_USB_MODE=1 (HWCDC), Serial = USB-JTAG/Serial.
// Debug prints are suppressed once the bridge connects (to avoid
// mixing text with binary protocol frames on the same serial port).

static DisplayManager display;
static SeesawManager seesaw;
static SerialComms comms;

// Debug print helper — suppressed when bridge is connected
#define DBG(fmt, ...) do { if (!comms.bridgeConnected()) Serial.printf(fmt "\n", ##__VA_ARGS__); } while(0)

// --- Callbacks ---

static void onButtonChange(uint8_t buttonId, bool pressed) {
    DBG("[btn] id=%d pressed=%d", buttonId, pressed);
    comms.sendButtonEvent(buttonId, pressed);

    // Visual feedback via NeoPixels
    if (pressed) {
        seesaw.setPixelColor(buttonId, 0x004400);  // Green when pressed
    } else {
        seesaw.setPixelColor(buttonId, 0x000000);  // Off when released
    }
    seesaw.showPixels();
}

static void onDisplayText(const char* text, uint16_t len) {
    char buf[512];
    uint16_t copyLen = len < sizeof(buf) - 1 ? len : sizeof(buf) - 1;
    memcpy(buf, text, copyLen);
    buf[copyLen] = '\0';

    display.setNotificationText(buf);
    display.update();
}

static void onStatusText(const char* text, uint16_t len) {
    char buf[128];
    uint16_t copyLen = len < sizeof(buf) - 1 ? len : sizeof(buf) - 1;
    memcpy(buf, text, copyLen);
    buf[copyLen] = '\0';

    display.setStatusText(buf);
    display.update();
}

static void onSetLeds(const uint8_t* data, uint16_t len) {
    for (uint16_t i = 0; i + 3 < len; i += 4) {
        uint8_t pixel = data[i];
        uint32_t color = ((uint32_t)data[i+1] << 16) |
                         ((uint32_t)data[i+2] << 8) |
                         data[i+3];
        seesaw.setPixelColor(pixel, color);
    }
    seesaw.showPixels();
}

static void onClearDisplay() {
    display.showIdleScreen();
    display.update();
}

static void onSetButtonLabels(const char* labels[4]) {
    display.setButtonLabels(labels[0], labels[1], labels[2], labels[3]);
    display.update();
}

void setup() {
    Serial.begin(SERIAL_BAUD);
    delay(2000);  // Let HWCDC enumerate

    // Setup debug prints always go through (bridge can't be connected yet)
    Serial.println("\n=== CamelPad Firmware Starting ===");

    Serial.println("[1/3] Initializing display...");
    display.begin();
    display.setStatusText("Booting...");
    display.update();
    Serial.println("[1/3] Display OK");

    Serial.println("[2/3] Initializing Seesaw...");
    if (!seesaw.begin()) {
        Serial.println("[2/3] Seesaw init FAILED!");
        display.setStatusText("Seesaw init FAILED");
        display.update();
    } else {
        Serial.println("[2/3] Seesaw OK");
        for (int i = 0; i < SEESAW_NEOPIXEL_COUNT; i++) {
            seesaw.setPixelColor(i, 0x001100);
        }
        seesaw.showPixels();
        delay(500);
    }

    seesaw.onButtonChange(onButtonChange);

    Serial.println("[3/3] Initializing comms...");
    comms.begin();
    comms.onDisplayText(onDisplayText);
    comms.onStatusText(onStatusText);
    comms.onSetLeds(onSetLeds);
    comms.onClearDisplay(onClearDisplay);
    comms.onSetButtonLabels(onSetButtonLabels);
    Serial.println("[3/3] Comms OK");

    seesaw.clearPixels();
    seesaw.showPixels();

    display.setStatusText("Ready - Waiting for connection...");
    display.update();
    Serial.println("=== Setup Complete ===");
}

static uint32_t lastHeartbeat = 0;

void loop() {
    comms.poll();
    seesaw.poll();

    // Periodic heartbeat — suppressed when bridge is connected
    if (millis() - lastHeartbeat > 5000) {
        lastHeartbeat = millis();
        DBG("[heartbeat] uptime=%lus", millis() / 1000);
    }

    delay(10);
}
