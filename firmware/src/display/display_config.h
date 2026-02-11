#pragma once

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <lgfx/v1/platforms/esp32s3/Panel_RGB.hpp>
#include <lgfx/v1/platforms/esp32s3/Bus_RGB.hpp>
#include "../config.h"

// 3-wire SPI bit-bang for ST7701 initialization.
// Must be called BEFORE LGFX init() since the ST7701 needs its vendor-specific
// register programming via SPI before the RGB parallel interface becomes active.
namespace st7701 {

static void spi_write_9bit(uint8_t cs, uint8_t scl, uint8_t sda, bool dc, uint8_t data) {
    // 9-bit SPI frame: [DC bit] [D7..D0]
    gpio_set_level((gpio_num_t)cs, 0);

    // Send DC bit (0 = command, 1 = data)
    gpio_set_level((gpio_num_t)scl, 0);
    gpio_set_level((gpio_num_t)sda, dc ? 1 : 0);
    gpio_set_level((gpio_num_t)scl, 1);

    // Send 8 data bits MSB first
    for (int i = 7; i >= 0; i--) {
        gpio_set_level((gpio_num_t)scl, 0);
        gpio_set_level((gpio_num_t)sda, (data >> i) & 1);
        gpio_set_level((gpio_num_t)scl, 1);
    }

    gpio_set_level((gpio_num_t)cs, 1);
}

static void write_cmd(uint8_t cmd) {
    spi_write_9bit(PIN_LCD_SPI_CS, PIN_LCD_SPI_SCK, PIN_LCD_SPI_SDO, false, cmd);
}

static void write_data(uint8_t data) {
    spi_write_9bit(PIN_LCD_SPI_CS, PIN_LCD_SPI_SCK, PIN_LCD_SPI_SDO, true, data);
}

struct InitCmd {
    uint8_t cmd;
    const uint8_t* data;
    uint8_t data_len;
    uint16_t delay_ms;
};

// Waveshare ESP32-S3-LCD-3.16 ST7701 init sequence
// Extracted from the manufacturer's example (lvgl_port.c lines 32-81)
static void init() {
    // Configure SPI pins as outputs
    gpio_set_direction((gpio_num_t)PIN_LCD_SPI_CS,  GPIO_MODE_OUTPUT);
    gpio_set_direction((gpio_num_t)PIN_LCD_SPI_SCK, GPIO_MODE_OUTPUT);
    gpio_set_direction((gpio_num_t)PIN_LCD_SPI_SDO, GPIO_MODE_OUTPUT);
    gpio_set_level((gpio_num_t)PIN_LCD_SPI_CS, 1);
    gpio_set_level((gpio_num_t)PIN_LCD_SPI_SCK, 1);

    // Reset display
    gpio_set_direction((gpio_num_t)PIN_LCD_RESET, GPIO_MODE_OUTPUT);
    gpio_set_level((gpio_num_t)PIN_LCD_RESET, 1);
    delay(10);
    gpio_set_level((gpio_num_t)PIN_LCD_RESET, 0);
    delay(10);
    gpio_set_level((gpio_num_t)PIN_LCD_RESET, 1);
    delay(120);

    // Command/data pairs from Waveshare example
    // Bank 13
    write_cmd(0xFF); write_data(0x77); write_data(0x01); write_data(0x00); write_data(0x00); write_data(0x13);
    write_cmd(0xEF); write_data(0x08);

    // Bank 10
    write_cmd(0xFF); write_data(0x77); write_data(0x01); write_data(0x00); write_data(0x00); write_data(0x10);
    write_cmd(0xC0); write_data(0xE5); write_data(0x02);
    write_cmd(0xC1); write_data(0x15); write_data(0x0A);
    write_cmd(0xC2); write_data(0x07); write_data(0x02);
    write_cmd(0xCC); write_data(0x10);

    // Gamma positive
    write_cmd(0xB0);
    uint8_t gamma_pos[] = {0x00,0x08,0x51,0x0D,0xCE,0x06,0x00,0x08,0x08,0x24,0x05,0xD0,0x0F,0x6F,0x36,0x1F};
    for (int i = 0; i < 16; i++) write_data(gamma_pos[i]);

    // Gamma negative
    write_cmd(0xB1);
    uint8_t gamma_neg[] = {0x00,0x10,0x4F,0x0C,0x11,0x05,0x00,0x07,0x07,0x18,0x02,0xD3,0x11,0x6E,0x34,0x1F};
    for (int i = 0; i < 16; i++) write_data(gamma_neg[i]);

    // Bank 11
    write_cmd(0xFF); write_data(0x77); write_data(0x01); write_data(0x00); write_data(0x00); write_data(0x11);
    write_cmd(0xB0); write_data(0x4D);
    write_cmd(0xB1); write_data(0x37);
    write_cmd(0xB2); write_data(0x87);
    write_cmd(0xB3); write_data(0x80);
    write_cmd(0xB5); write_data(0x4A);
    write_cmd(0xB7); write_data(0x85);
    write_cmd(0xB8); write_data(0x21);
    write_cmd(0xB9); write_data(0x00); write_data(0x13);
    write_cmd(0xC0); write_data(0x09);
    write_cmd(0xC1); write_data(0x78);
    write_cmd(0xC2); write_data(0x78);
    write_cmd(0xD0); write_data(0x88);

    // Power/timing
    write_cmd(0xE0); write_data(0x80); write_data(0x00); write_data(0x02);
    delay(100);

    write_cmd(0xE1);
    uint8_t e1[] = {0x0F,0xA0,0x00,0x00,0x10,0xA0,0x00,0x00,0x00,0x60,0x60};
    for (int i = 0; i < 11; i++) write_data(e1[i]);

    write_cmd(0xE2);
    uint8_t e2[] = {0x30,0x30,0x60,0x60,0x45,0xA0,0x00,0x00,0x46,0xA0,0x00,0x00,0x00};
    for (int i = 0; i < 13; i++) write_data(e2[i]);

    write_cmd(0xE3); write_data(0x00); write_data(0x00); write_data(0x33); write_data(0x33);
    write_cmd(0xE4); write_data(0x44); write_data(0x44);

    write_cmd(0xE5);
    uint8_t e5[] = {0x0F,0x4A,0xA0,0xA0,0x11,0x4A,0xA0,0xA0,0x13,0x4A,0xA0,0xA0,0x15,0x4A,0xA0,0xA0};
    for (int i = 0; i < 16; i++) write_data(e5[i]);

    write_cmd(0xE6); write_data(0x00); write_data(0x00); write_data(0x33); write_data(0x33);
    write_cmd(0xE7); write_data(0x44); write_data(0x44);

    write_cmd(0xE8);
    uint8_t e8[] = {0x10,0x4A,0xA0,0xA0,0x12,0x4A,0xA0,0xA0,0x14,0x4A,0xA0,0xA0,0x16,0x4A,0xA0,0xA0};
    for (int i = 0; i < 16; i++) write_data(e8[i]);

    write_cmd(0xEB);
    uint8_t eb[] = {0x02,0x00,0x4E,0x4E,0xEE,0x44,0x00};
    for (int i = 0; i < 7; i++) write_data(eb[i]);

    write_cmd(0xED);
    uint8_t ed[] = {0xFF,0xFF,0x04,0x56,0x72,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0x27,0x65,0x40,0xFF,0xFF};
    for (int i = 0; i < 16; i++) write_data(ed[i]);

    write_cmd(0xEF);
    uint8_t ef[] = {0x08,0x08,0x08,0x40,0x3F,0x64};
    for (int i = 0; i < 6; i++) write_data(ef[i]);

    // Bank 13 - power sequence
    write_cmd(0xFF); write_data(0x77); write_data(0x01); write_data(0x00); write_data(0x00); write_data(0x13);
    write_cmd(0xE8); write_data(0x00); write_data(0x0E);

    // Bank 00
    write_cmd(0xFF); write_data(0x77); write_data(0x01); write_data(0x00); write_data(0x00); write_data(0x00);

    // Sleep out
    write_cmd(0x11);
    delay(120);

    // Bank 13 again
    write_cmd(0xFF); write_data(0x77); write_data(0x01); write_data(0x00); write_data(0x00); write_data(0x13);
    write_cmd(0xE8); write_data(0x00); write_data(0x0C);
    delay(10);
    write_cmd(0xE8); write_data(0x00); write_data(0x00);

    // Bank 00
    write_cmd(0xFF); write_data(0x77); write_data(0x01); write_data(0x00); write_data(0x00); write_data(0x00);

    // Color format RGB565
    write_cmd(0x3A); write_data(0x55);
    // Normal display direction
    write_cmd(0x36); write_data(0x00);
    // Tearing effect on
    write_cmd(0x35); write_data(0x00);
    // Display ON
    write_cmd(0x29);
    delay(20);
}

} // namespace st7701

class LGFX_CamelPad : public lgfx::LGFX_Device {
public:
    lgfx::Bus_RGB      _bus_instance;
    lgfx::Panel_RGB    _panel_instance;
    lgfx::Light_PWM    _light_instance;

    LGFX_CamelPad() {
        // --- RGB Bus configuration ---
        {
            auto cfg = _bus_instance.config();
            cfg.panel = &_panel_instance;

            // Data pins in BGR order (matching Waveshare RGB panel config)
            cfg.pin_d0  = PIN_LCD_B0;   // GPIO21
            cfg.pin_d1  = PIN_LCD_B1;   // GPIO5
            cfg.pin_d2  = PIN_LCD_B2;   // GPIO45
            cfg.pin_d3  = PIN_LCD_B3;   // GPIO48
            cfg.pin_d4  = PIN_LCD_B4;   // GPIO47

            cfg.pin_d5  = PIN_LCD_G0;   // GPIO14
            cfg.pin_d6  = PIN_LCD_G1;   // GPIO13
            cfg.pin_d7  = PIN_LCD_G2;   // GPIO12
            cfg.pin_d8  = PIN_LCD_G3;   // GPIO11
            cfg.pin_d9  = PIN_LCD_G4;   // GPIO10
            cfg.pin_d10 = PIN_LCD_G5;   // GPIO9

            cfg.pin_d11 = PIN_LCD_R0;   // GPIO17
            cfg.pin_d12 = PIN_LCD_R1;   // GPIO46
            cfg.pin_d13 = PIN_LCD_R2;   // GPIO3
            cfg.pin_d14 = PIN_LCD_R3;   // GPIO8
            cfg.pin_d15 = PIN_LCD_R4;   // GPIO18

            cfg.pin_henable = PIN_LCD_DE;
            cfg.pin_vsync   = PIN_LCD_VSYNC;
            cfg.pin_hsync   = PIN_LCD_HSYNC;
            cfg.pin_pclk    = PIN_LCD_PCLK;

            cfg.freq_write = LCD_PCLK_HZ;

            cfg.hsync_polarity    = 0;
            cfg.hsync_front_porch = LCD_HSYNC_FRONT_PORCH;
            cfg.hsync_pulse_width = LCD_HSYNC_PULSE_WIDTH;
            cfg.hsync_back_porch  = LCD_HSYNC_BACK_PORCH;
            cfg.vsync_polarity    = 0;
            cfg.vsync_front_porch = LCD_VSYNC_FRONT_PORCH;
            cfg.vsync_pulse_width = LCD_VSYNC_PULSE_WIDTH;
            cfg.vsync_back_porch  = LCD_VSYNC_BACK_PORCH;
            cfg.pclk_idle_high    = 0;
            cfg.de_idle_high      = 0;

            _bus_instance.config(cfg);
        }
        _panel_instance.setBus(&_bus_instance);

        // --- Panel configuration ---
        {
            auto cfg = _panel_instance.config();
            cfg.memory_width  = LCD_H_RES;
            cfg.memory_height = LCD_V_RES;
            cfg.panel_width   = LCD_H_RES;
            cfg.panel_height  = LCD_V_RES;
            cfg.offset_x = 0;
            cfg.offset_y = 0;
            _panel_instance.config(cfg);
        }

        {
            auto cfg = _panel_instance.config_detail();
            cfg.use_psram = 2;  // PSRAM only (0=SRAM, 1=mixed/unimplemented, 2=PSRAM)
            _panel_instance.config_detail(cfg);
        }

        // --- Backlight ---
        {
            auto cfg = _light_instance.config();
            cfg.pin_bl = PIN_LCD_BL;
            cfg.invert = true;
            cfg.freq   = 50000;
            cfg.pwm_channel = 1;
            _light_instance.config(cfg);
        }
        _panel_instance.light(&_light_instance);

        setPanel(&_panel_instance);
    }
};
