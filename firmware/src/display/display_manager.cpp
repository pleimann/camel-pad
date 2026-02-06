#include "display_manager.h"
#include <cstring>

bool DisplayManager::begin() {
    st7701::init();
    return beginAfterST7701();
}

bool DisplayManager::beginAfterST7701() {
    _display.init();
    _display.setRotation(1);  // 90-degree rotation: 820x320 landscape
    _display.setBrightness(200);

    // Create full-screen sprite in PSRAM for double-buffered rendering
    _canvas.setColorDepth(16);
    _canvas.setPsram(true);
    if (!_canvas.createSprite(SCREEN_WIDTH, SCREEN_HEIGHT)) {
        // Fallback: draw directly to display without sprite
        return true;
    }

    _dirty = true;
    update();
    return true;
}

void DisplayManager::setStatusText(const char* text) {
    strncpy(_statusText, text, sizeof(_statusText) - 1);
    _statusText[sizeof(_statusText) - 1] = '\0';
    _dirty = true;
}

void DisplayManager::setNotificationText(const char* text) {
    strncpy(_notificationText, text, sizeof(_notificationText) - 1);
    _notificationText[sizeof(_notificationText) - 1] = '\0';
    _dirty = true;
}

void DisplayManager::setButtonLabels(const char* btn1, const char* btn2,
                                     const char* btn3, const char* btn4) {
    const char* labels[] = {btn1, btn2, btn3, btn4};
    for (int i = 0; i < 4; i++) {
        if (labels[i]) {
            strncpy(_buttonLabels[i], labels[i], sizeof(_buttonLabels[i]) - 1);
            _buttonLabels[i][sizeof(_buttonLabels[i]) - 1] = '\0';
        }
    }
    _dirty = true;
}

void DisplayManager::showIdleScreen() {
    setStatusText("Waiting for connection...");
    setNotificationText("");
    setButtonLabels("1", "2", "3", "4");
    _dirty = true;
}

void DisplayManager::showNotification(const char* text, const char* category) {
    if (category && category[0]) {
        char statusBuf[128];
        snprintf(statusBuf, sizeof(statusBuf), "[%s]", category);
        setStatusText(statusBuf);
    }
    setNotificationText(text);
    _dirty = true;
}

void DisplayManager::setBrightness(uint8_t level) {
    _display.setBrightness(level);
}

void DisplayManager::update() {
    if (!_dirty) return;
    _dirty = false;

    LGFX_Sprite* target;
    bool useSprite = _canvas.getBuffer() != nullptr;

    if (useSprite) {
        target = &_canvas;
    } else {
        // Draw directly to display (no sprite available)
        _display.startWrite();
    }

    auto& gfx = useSprite ? (LovyanGFX&)_canvas : (LovyanGFX&)_display;

    // Clear background
    gfx.fillScreen(COL_BG);

    // Draw status bar
    gfx.fillRect(0, STATUS_Y, SCREEN_WIDTH, STATUS_H, COL_STATUS_BG);
    gfx.setTextColor(COL_STATUS_FG, COL_STATUS_BG);
    gfx.setTextSize(2);
    gfx.setTextDatum(lgfx::middle_left);
    gfx.drawString(_statusText, 8, STATUS_Y + STATUS_H / 2);

    // Draw notification text area
    gfx.setTextColor(COL_TEXT_FG, COL_BG);
    gfx.setTextSize(2);
    gfx.setTextDatum(lgfx::top_left);
    gfx.setCursor(8, TEXT_Y + 8);
    gfx.setTextWrap(true);

    // Word-wrap the notification text manually within the text area
    int x = 8;
    int y = TEXT_Y + 8;
    int maxX = SCREEN_WIDTH - 8;
    int maxY = TEXT_Y + TEXT_H - 8;
    int charW = 12;  // Approximate width per character at textSize 2
    int lineH = 20;  // Approximate line height at textSize 2

    const char* p = _notificationText;
    while (*p && y + lineH <= maxY) {
        // Find the end of the current word
        const char* wordStart = p;
        while (*p && *p != ' ' && *p != '\n') p++;
        int wordLen = p - wordStart;

        // Check if word fits on current line
        if (x + wordLen * charW > maxX && x > 8) {
            x = 8;
            y += lineH;
            if (y + lineH > maxY) break;
        }

        // Draw the word character by character
        for (int i = 0; i < wordLen && y + lineH <= maxY; i++) {
            gfx.setCursor(x, y);
            gfx.print(wordStart[i]);
            x += charW;
            if (x > maxX) {
                x = 8;
                y += lineH;
            }
        }

        // Handle space or newline after word
        if (*p == '\n') {
            x = 8;
            y += lineH;
            p++;
        } else if (*p == ' ') {
            x += charW;
            p++;
        }
    }

    // Draw button bar
    gfx.fillRect(0, BUTTON_Y, SCREEN_WIDTH, BUTTON_H, COL_BG);
    for (int i = 0; i < 4; i++) {
        int bx = i * BTN_WIDTH + 4;
        int by = BUTTON_Y + 4;
        int bw = BTN_WIDTH - 8;
        int bh = BUTTON_H - 8;

        gfx.fillRoundRect(bx, by, bw, bh, 6, COL_BTN_BG);
        gfx.drawRoundRect(bx, by, bw, bh, 6, COL_BTN_BORDER);

        gfx.setTextColor(COL_BTN_FG, COL_BTN_BG);
        gfx.setTextSize(2);
        gfx.setTextDatum(lgfx::middle_center);
        gfx.drawString(_buttonLabels[i], bx + bw / 2, by + bh / 2);
    }

    // Push sprite to display
    if (useSprite) {
        _canvas.pushSprite(&_display, 0, 0);
    } else {
        _display.endWrite();
    }
}
