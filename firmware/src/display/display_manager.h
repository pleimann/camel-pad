#pragma once

#include "display_config.h"

class DisplayManager {
public:
    bool begin();
    bool beginAfterST7701();  // Call after st7701::init() already done
    void setStatusText(const char* text);
    void setNotificationText(const char* text);
    void setButtonLabels(const char* btn1, const char* btn2,
                         const char* btn3, const char* btn4);
    void showIdleScreen();
    void showNotification(const char* text, const char* category);
    void setBrightness(uint8_t level);
    void update();

    LGFX_CamelPad& display() { return _display; }

private:
    void drawStatusBar();
    void drawTextArea();
    void drawButtonBar();

    LGFX_CamelPad _display;
    LGFX_Sprite   _canvas;

    char _statusText[128]       = "Ready";
    char _notificationText[512] = "";
    char _buttonLabels[4][32]   = {"1", "2", "3", "4"};

    bool _dirty = true;

    // Layout constants (after 90-degree rotation: 820x320)
    static constexpr int STATUS_Y      = 0;
    static constexpr int STATUS_H      = 30;
    static constexpr int TEXT_Y        = 30;
    static constexpr int TEXT_H        = 220;
    static constexpr int BUTTON_Y      = 250;
    static constexpr int BUTTON_H      = 70;
    static constexpr int BTN_WIDTH     = SCREEN_WIDTH / 4;  // 205

    // Colors (RGB565)
    static constexpr uint16_t COL_BG         = 0x0841;  // Dark gray
    static constexpr uint16_t COL_STATUS_BG  = 0x1082;  // Slightly lighter
    static constexpr uint16_t COL_STATUS_FG  = 0x07E0;  // Green
    static constexpr uint16_t COL_TEXT_FG    = 0xFFFF;  // White
    static constexpr uint16_t COL_BTN_BG     = 0x2945;  // Medium gray
    static constexpr uint16_t COL_BTN_FG     = 0xFFFF;  // White
    static constexpr uint16_t COL_BTN_BORDER = 0x4A69;  // Light gray
};
