#include "seesaw_manager.h"
#include <Wire.h>

constexpr uint8_t SeesawManager::BUTTON_PINS[4];

bool SeesawManager::begin() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    // Single begin() — handles reset, NeoPixel init, and I2C setup
    if (!_pixels.begin(SEESAW_I2C_ADDR)) {
        return false;
    }
    _pixels.setBrightness(50);
    clearPixels();
    showPixels();

    // All pins use INPUT_PULLUP. Auto-detect idle polarity:
    // if a pin reads LOW at boot (tied to GND), it's active-high.
    for (int i = 0; i < 4; i++) {
        _pixels.pinMode(BUTTON_PINS[i], INPUT_PULLUP);
    }
    delay(10);  // Let pullups settle
    for (int i = 0; i < 4; i++) {
        bool idle = _pixels.digitalRead(BUTTON_PINS[i]);
        _activeLow[i] = (idle == 1);  // HIGH at idle = active-low button
        _lastButtonState[i] = false;
        _reportedState[i] = false;
    }

    return true;
}

void SeesawManager::poll() {
    uint32_t now = millis();
    for (int i = 0; i < 4; i++) {
        // Skip if within debounce window
        if (now - _lastChangeTime[i] < DEBOUNCE_MS) continue;

        bool raw = _pixels.digitalRead(BUTTON_PINS[i]);
        bool pressed = _activeLow[i] ? !raw : raw;

        if (pressed == _lastButtonState[i]) {
            // Same as last raw read — count consecutive matches
            if (_stableCount[i] < 255) _stableCount[i]++;
        } else {
            // Raw state changed — reset counter
            _lastButtonState[i] = pressed;
            _stableCount[i] = 1;
        }

        // Only report when we have enough consistent reads AND it differs from reported state
        if (_stableCount[i] >= DEBOUNCE_READS && pressed != _reportedState[i]) {
            _reportedState[i] = pressed;
            _lastChangeTime[i] = now;
            if (_callback) {
                _callback(i, pressed);
            }
        }
    }
}

bool SeesawManager::isButtonPressed(uint8_t btnIndex) {
    if (btnIndex >= 4) return false;
    return _lastButtonState[btnIndex];
}


void SeesawManager::setPixelColor(uint8_t pixel, uint32_t color) {
    if (pixel < SEESAW_NEOPIXEL_COUNT) {
        _pixels.setPixelColor(pixel, color);
    }
}

void SeesawManager::clearPixels() {
    for (int i = 0; i < SEESAW_NEOPIXEL_COUNT; i++) {
        _pixels.setPixelColor(i, 0);
    }
}

void SeesawManager::showPixels() {
    _pixels.show();
}
