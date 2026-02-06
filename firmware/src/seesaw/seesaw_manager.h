#pragma once

#include <Adafruit_seesaw.h>
#include <seesaw_neopixel.h>
#include "../config.h"

class SeesawManager {
public:
    using ButtonCallback = void (*)(uint8_t buttonId, bool pressed);

    bool begin();
    void poll();
    bool isButtonPressed(uint8_t btnIndex);
    void setPixelColor(uint8_t pixel, uint32_t color);
    void clearPixels();
    void showPixels();
    void onButtonChange(ButtonCallback cb) { _callback = cb; }

private:
    static constexpr uint32_t DEBOUNCE_MS = 50;
    static constexpr uint8_t  DEBOUNCE_READS = 3;  // Require N consistent reads

    // Single seesaw instance for both GPIO and NeoPixels
    // (seesaw_NeoPixel inherits Adafruit_seesaw, so it has pinMode/digitalRead)
    seesaw_NeoPixel _pixels{SEESAW_NEOPIXEL_COUNT, SEESAW_NEOPIX_PIN,
                            NEO_GRB + NEO_KHZ800};

    static constexpr uint8_t BUTTON_PINS[4] = {
        SEESAW_BTN_1, SEESAW_BTN_2, SEESAW_BTN_3, SEESAW_BTN_4
    };
    // true = active-low (pullup, press→LOW), false = active-high (pulldown, press→HIGH)
    bool _activeLow[4] = {};
    bool _lastButtonState[4] = {};
    bool _reportedState[4] = {};      // State reported to callback
    uint8_t _stableCount[4] = {};     // Consecutive reads matching _lastButtonState
    uint32_t _lastChangeTime[4] = {};
    ButtonCallback _callback = nullptr;
};
